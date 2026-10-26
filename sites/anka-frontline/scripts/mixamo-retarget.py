"""Local Mixamo FBX -> animated GLB retargeting, preserving the input model.

Run in Blender:
 blender --background --factory-startup --python scripts/mixamo-retarget.py -- \
  --source-fbx "Rifle Down To Aim.fbx" --target-glb male.glb \
  --output-glb male-aim.glb --clip-name AimRaise

Uses anatomical body-space rotations and a virtual T-pose swing correction to
handle A-pose bindings and bone roll. Retains target bone lengths, meshes, skin,
materials, existing actions and the external normalization transform.
"""
import argparse
import json
import math
import re
import struct
import sys
from pathlib import Path
import bpy
from mathutils import Matrix, Quaternion, Vector

REQUIRED = ('hips', 'spine', 'head', 'leftarm', 'leftforearm', 'lefthand',
            'rightarm', 'rightforearm', 'righthand', 'leftupleg', 'leftleg',
            'leftfoot', 'rightupleg', 'rightleg', 'rightfoot')


def canonical(name):
    value = re.sub(r'[^a-z0-9]', '', name.split('|')[-1].split(':')[-1].lower())
    value = re.sub(r'^mixamorig\d*', '', value)
    aliases = {'lefttoebaseend':'lefttoeend', 'righttoebaseend':'righttoeend',
               'headend':'headtopend'}
    for side in ('left','right'):
        for finger in ('thumb','index','middle','ring','pinky'):
            for suffix in ('end','3end'):
                aliases[side+'hand'+finger+suffix] = side+'hand'+finger+'4'
    return aliases.get(value, value)


def lookup(rig):
    result = {}
    for bone in rig.data.bones:
        key = canonical(bone.name)
        if key in result:
            raise ValueError(f'Ambiguous bone identity {key}')
        result[key] = bone
    return result


def rotation(matrix):
    result = matrix.to_quaternion()
    result.normalize()
    return result


def check_transform(rig):
    scale = rig.matrix_world.to_scale()
    if rig.matrix_world.determinant() <= 0:
        raise ValueError(f'{rig.name}: mirrored armature object transform')
    if max(scale)-min(scale) > max(scale)*1e-3:
        raise ValueError(f'{rig.name}: non-uniform object scale {list(scale)}')


def body_basis(rig, bones):
    world = rig.matrix_world
    up = ((world @ bones['head'].head_local)-(world @ bones['hips'].head_local)).normalized()
    left = bones.get('leftshoulder', bones['leftarm'])
    right = bones.get('rightshoulder', bones['rightarm'])
    lateral = (world @ right.head_local)-(world @ left.head_local)
    lateral -= up*lateral.dot(up)
    lateral.normalize()
    back = up.cross(lateral).normalized()
    up = lateral.cross(back).normalized()
    matrix = Matrix((lateral,back,up)).transposed()
    if matrix.determinant() < .99:
        raise ValueError('Invalid anatomical coordinate frame')
    return matrix.to_quaternion()


def leg_height(rig, bones, basis):
    hips = rig.matrix_world @ bones['hips'].head_local
    up = basis @ Vector((0,0,1))
    feet = [rig.matrix_world @ bones[key].head_local for key in ('leftfoot','rightfoot')]
    height = sum((hips-foot).dot(up) for foot in feet)/2
    if height <= 1e-8:
        raise ValueError('Invalid pelvis-to-foot rest height')
    return height


def set_frame(frame):
    whole = math.floor(frame)
    bpy.context.scene.frame_set(whole, subframe=frame-whole)
    bpy.context.view_layer.update()


def activate(rig, action):
    rig.animation_data_create()
    rig.animation_data.action = action
    if action.slots:
        rig.animation_data.action_slot = action.slots[0]


def track_action(rig, action, name, replace=False):
    for track in list(rig.animation_data.nla_tracks):
        if track.name == name:
            if not replace:
                raise ValueError(f'Existing action {name}; pass --replace')
            rig.animation_data.nla_tracks.remove(track)
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    first,last = action.frame_range
    strip = track.strips.new(name,1,action)
    strip.action_frame_start = first
    strip.action_frame_end = last
    strip.extrapolation = 'NOTHING'
    track.mute = True


def repair_tangents(path):
    data = bytearray(Path(path).read_bytes())
    size = struct.unpack_from('<I',data,12)[0]
    document = json.loads(data[20:20+size])
    binary = 20+size+8
    repaired = zeros = 0
    seen = set()
    for mesh in document.get('meshes',[]):
        for primitive in mesh['primitives']:
            attrs = primitive['attributes']
            index = attrs.get('TANGENT')
            if index is None or index in seen:
                continue
            seen.add(index)
            tangent = document['accessors'][index]
            normal = document['accessors'][attrs['NORMAL']]
            tv = document['bufferViews'][tangent['bufferView']]
            nv = document['bufferViews'][normal['bufferView']]
            assert tangent['componentType'] == normal['componentType'] == 5126
            to = binary+tv.get('byteOffset',0)+tangent.get('byteOffset',0)
            no = binary+nv.get('byteOffset',0)+normal.get('byteOffset',0)
            for vertex in range(tangent['count']):
                pos = to+vertex*tv.get('byteStride',16)
                x,y,z,w = struct.unpack_from('<4f',data,pos)
                length = math.sqrt(x*x+y*y+z*z)
                if abs(length-1) < 1e-5:
                    continue
                if length < 1e-8:
                    nx,ny,nz = struct.unpack_from('<3f',data,no+vertex*nv.get('byteStride',12))
                    x,y,z = (0,nz,-ny) if abs(nx)<.8 else (-nz,0,nx)
                    length = math.sqrt(x*x+y*y+z*z)
                    zeros += 1
                if length < 1e-8:
                    raise ValueError('Degenerate tangent and normal')
                struct.pack_into('<4f',data,pos,x/length,y/length,z/length,-1 if w<0 else 1)
                repaired += 1
    Path(path).write_bytes(data)
    return {'normalized':repaired,'zero_tangents':zeros}


def vl(value):
    return [round(float(v),7) for v in value]


def add_aim_loops(target, body_q):
    """Derive a stable aim hold and subtle recoil from the real AimRaise endpoint."""
    raise_track = next((t for t in target.animation_data.nla_tracks if t.name=='AimRaise'),None)
    if not raise_track or not raise_track.strips:
        raise ValueError('--create-aim-loops requires an existing AimRaise clip')
    for track in list(target.animation_data.nla_tracks):
        if track.name=='Shoot':
            track.name='TripoShoot'
            track.strips[0].action.name='TripoShoot'
    if any(t.name in ('AimIdle','Shoot') for t in target.animation_data.nla_tracks):
        raise ValueError('AimIdle or local Shoot already exists')
    raise_action=raise_track.strips[0].action
    activate(target,raise_action)
    set_frame(raise_action.frame_range[1])
    snapshot={pb.name:{'location':pb.location.copy(),'rotation':pb.rotation_quaternion.copy(),
                       'scale':pb.scale.copy()} for pb in target.pose.bones}
    table=lookup(target)
    spine=table.get('spine2',table['spine'])
    spine_pb=target.pose.bones[spine.name]
    parent_pose_q=rotation(spine_pb.parent.matrix) if spine_pb.parent else rotation(Matrix.Identity(4))
    relative_rest=(spine.parent.matrix_local.inverted()@spine.matrix_local
                   if spine.parent else spine.matrix_local)
    relative_q_inv=rotation(relative_rest).inverted()
    base_pose_q=rotation(spine_pb.matrix)
    rig_q=rotation(target.matrix_world)
    rig_q_inv=rig_q.inverted()
    right_world=body_q@Vector((1,0,0))
    specs=[('AimIdle',[(1,0),(61,0)]),
           ('Shoot',[(1,0),(2,1.1),(4,.55),(7,.10),(10,0)])]
    result=[]
    for name,keys in specs:
        clip=bpy.data.actions.new(name)
        clip.use_fake_user=True
        activate(target,clip)
        for frame,recoil in keys:
            for pb in target.pose.bones:
                state=snapshot[pb.name]
                pb.location=state['location']
                pb.rotation_quaternion=state['rotation']
                pb.scale=state['scale']
            if recoil:
                delta_world=Quaternion(right_world,-math.radians(recoil))
                desired_armature=(rig_q_inv@delta_world@rig_q)@base_pose_q
                basis_q=relative_q_inv@parent_pose_q.inverted()@desired_armature
                basis_q.normalize()
                if basis_q.dot(snapshot[spine.name]['rotation'])<0:
                    basis_q.negate()
                spine_pb.rotation_quaternion=basis_q
            for pb in target.pose.bones:
                pb.keyframe_insert('rotation_quaternion',frame=frame,group=pb.name)
                if canonical(pb.name)=='hips':
                    pb.keyframe_insert('location',frame=frame,group=pb.name)
        track_action(target,clip,name)
        result.append({'name':name,'duration_seconds':(keys[-1][0]-1)/bpy.context.scene.render.fps,
                       'provenance':'Local hold/recoil from Mixamo AimRaise final pose',
                       'max_spine_recoil_degrees':max(k[1] for k in keys)})
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-fbx',required=True)
    p.add_argument('--target-glb',required=True)
    p.add_argument('--output-glb',required=True)
    p.add_argument('--clip-name',default='RifleDownToAim')
    p.add_argument('--replace',action='store_true')
    p.add_argument('--fps',type=int,default=30)
    p.add_argument('--source-action')
    p.add_argument('--output-blend')
    p.add_argument('--report')
    p.add_argument('--max-frames',type=int,default=1800)
    p.add_argument('--create-aim-loops',action='store_true',
                   help='Add AimIdle and local light-recoil Shoot, keeping prior Shoot as TripoShoot')
    a = p.parse_args(sys.argv[sys.argv.index('--')+1:])
    source_path,target_path,output_path = [Path(v).resolve() for v in
        (a.source_fbx,a.target_glb,a.output_glb)]
    if output_path in (target_path,source_path):
        raise ValueError('Output must be a new path; original models are preserved')
    if not source_path.is_file() or not target_path.is_file():
        raise FileNotFoundError('Source FBX and target GLB must exist')
    if not 1<=a.fps<=120:
        raise ValueError('FPS must be between 1 and 120')
    output_path.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for old in list(bpy.data.actions):
        bpy.data.actions.remove(old)
    scene = bpy.context.scene
    scene.render.fps = a.fps
    scene.render.fps_base = 1
    bpy.ops.import_scene.gltf(filepath=str(target_path))
    target_objects = set(bpy.context.selected_objects)
    target_rigs = [o for o in target_objects if o.type=='ARMATURE']
    if len(target_rigs)!=1:
        raise ValueError(f'Expected one target rig, found {len(target_rigs)}')
    target = target_rigs[0]
    target_actions = list(bpy.data.actions)
    original_clips = [action.name for action in target_actions]
    if a.clip_name in original_clips and not a.replace:
        raise ValueError(f'Clip {a.clip_name} exists; pass --replace')
    known = {strip.action for track in target.animation_data.nla_tracks for strip in track.strips}
    for action in target_actions:
        if action not in known and action.name!=a.clip_name:
            track_action(target,action,action.name)
    for track in target.animation_data.nla_tracks:
        track.mute = True
    target.animation_data.action = None
    for pb in target.pose.bones:
        pb.matrix_basis.identity()
    target.data.pose_position = 'POSE'
    bpy.context.view_layer.update()
    target_world = target.matrix_world.copy()
    check_transform(target)
    objects_before,actions_before = set(bpy.data.objects),set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=str(source_path),use_anim=True,
                            automatic_bone_orientation=False,ignore_leaf_bones=False)
    source_objects = set(bpy.data.objects)-objects_before
    source_rigs = [o for o in source_objects if o.type=='ARMATURE']
    if len(source_rigs)!=1:
        raise ValueError(f'Expected one source FBX rig, found {len(source_rigs)}')
    source = source_rigs[0]
    source_fps = scene.render.fps/scene.render.fps_base
    source_actions = list(set(bpy.data.actions)-actions_before)
    if a.source_action:
        candidates = [action for action in source_actions if action.name==a.source_action]
        if len(candidates)!=1:
            raise ValueError(f'Source actions: {[action.name for action in source_actions]}')
        source_action = candidates[0]
    elif source.animation_data and source.animation_data.action:
        source_action = source.animation_data.action
    elif len(source_actions)==1:
        source_action = source_actions[0]
    else:
        raise ValueError(f'Choose --source-action from {[action.name for action in source_actions]}')
    source_action_name = source_action.name
    activate(source,source_action)
    for track in source.animation_data.nla_tracks:
        track.mute = True
    start,end = source_action.frame_range
    duration = (end-start)/source_fps
    if duration<=0:
        raise ValueError('Source animation has no duration')
    frame_count = math.ceil(duration*a.fps)+1
    if frame_count>a.max_frames:
        raise ValueError(f'{frame_count} frames exceed --max-frames')
    scene.render.fps = a.fps
    scene.render.fps_base = 1
    set_frame(start)
    check_transform(source)
    sb,tb = lookup(source),lookup(target)
    for role,bones in [('source',sb),('target',tb)]:
        missing = [key for key in REQUIRED if key not in bones]
        if missing:
            raise ValueError(f'{role} missing bones: {missing}')
    mapping = {bone.name:sb[key].name for key,bone in tb.items() if key in sb}
    if len(mapping)<20:
        raise ValueError(f'Too few matched bones: {len(mapping)}')
    unmapped_source = [bone.name for bone in source.data.bones if bone.name not in mapping.values()]
    sq,tq = body_basis(source,sb),body_basis(target,tb)
    sq_inv,tq_inv = sq.inverted(),tq.inverted()
    target_rig_q_inv = rotation(target_world).inverted()
    source_rest = {bone.name:source.matrix_world@bone.matrix_local for bone in source.data.bones}
    target_rest = {bone.name:bone.matrix_local.copy() for bone in target.data.bones}
    target_rest_world = {name:target_world@matrix for name,matrix in target_rest.items()}
    source_rest_q = {name:sq_inv@rotation(matrix) for name,matrix in source_rest.items()}
    virtual_target,corrections = {},[]
    for target_name,source_name in mapping.items():
        source_q = source_rest_q[source_name]
        target_q = tq_inv@rotation(target_rest_world[target_name])
        swing = (target_q@Vector((0,1,0))).rotation_difference(source_q@Vector((0,1,0)))
        virtual_target[target_name] = swing@target_q
        corrections.append({'target':target_name,'source':source_name,
                            'rest_swing_degrees':round(math.degrees(swing.angle),4)})
    height_ratio = leg_height(target,tb,tq)/leg_height(source,sb,sq)
    source_hips,target_hips = sb['hips'].name,tb['hips'].name
    source_hips_rest = source_rest[source_hips].translation.copy()
    target_hips_rest = target_rest_world[target_hips].translation.copy()
    target_world_inv = target_world.inverted()
    ordered = sorted(target.data.bones,key=lambda bone:len(bone.parent_recursive))
    replacing = next((action for action in target_actions if action.name==a.clip_name),None)
    if replacing:
        replacing.name = a.clip_name+'_OriginalBackup'
    action = bpy.data.actions.new(a.clip_name)
    action.use_fake_user = True
    activate(target,action)
    for pb in target.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    previous,wrist_distances,vertical_offsets,pose_samples = {},[],[],[]
    last_frame = 1
    for index in range(frame_count):
        seconds = min(duration,index/a.fps)
        set_frame(start+seconds*source_fps)
        source_pose = {name:source.matrix_world@source.pose.bones[name].matrix for name in mapping.values()}
        offset = sq_inv@(source_pose[source_hips].translation-source_hips_rest)
        dz = offset.z*height_ratio
        vertical_offsets.append(dz)
        hips_world = target_hips_rest+tq@Vector((0,0,dz))
        target_pose = {}
        for bone in ordered:
            name = bone.name
            parent = bone.parent.name if bone.parent else None
            parent_rest = target_rest[parent] if parent else Matrix.Identity(4)
            parent_pose = target_pose[parent] if parent else Matrix.Identity(4)
            relative = parent_rest.inverted()@target_rest[name]
            if name in mapping:
                source_name = mapping[name]
                source_pose_q = sq_inv@rotation(source_pose[source_name])
                canonical_q = source_pose_q@source_rest_q[source_name].inverted()@virtual_target[name]
                desired_q = target_rig_q_inv@tq@canonical_q
                head = (parent_pose@relative).translation if parent else target_rest[name].translation.copy()
                if name==target_hips:
                    head = target_world_inv@hips_world
                desired = Matrix.Translation(head)@desired_q.to_matrix().to_4x4()
            else:
                desired = parent_pose@relative if parent else target_rest[name].copy()
            target_pose[name] = desired
            basis = relative.inverted()@parent_pose.inverted()@desired
            location,quaternion,unused_scale = basis.decompose()
            quaternion.normalize()
            if name in previous and quaternion.dot(previous[name])<0:
                quaternion.negate()
            previous[name] = quaternion.copy()
            pb = target.pose.bones[name]
            pb.location = location if name==target_hips else (0,0,0)
            pb.rotation_quaternion = quaternion
            pb.scale = (1,1,1)
            last_frame = 1+seconds*a.fps
            pb.keyframe_insert('rotation_quaternion',frame=last_frame,group=name)
            if name==target_hips:
                pb.keyframe_insert('location',frame=last_frame,group=name)
        left = target_world@target_pose[tb['lefthand'].name].translation
        right = target_world@target_pose[tb['righthand'].name].translation
        wrist_distances.append((left-right).length)
        if index in (0,frame_count//2,frame_count-1):
            pose_samples.append({'fraction':seconds/duration,'frame':last_frame,
                'bones':{key:{'position_world':vl(target_world@target_pose[tb[key].name].translation),
                              'rotation_world_wxyz':vl(rotation(target_world@target_pose[tb[key].name]))}
                         for key in ('hips','spine','head','leftarm','leftforearm','lefthand',
                                     'rightarm','rightforearm','righthand','leftfoot','rightfoot')}})
    if max(abs(target.matrix_world[i][j]-target_world[i][j]) for i in range(4) for j in range(4))>1e-5:
        raise ValueError('Target normalization transform changed during sampling')
    track_action(target,action,a.clip_name,replace=a.replace)
    local_clips=add_aim_loops(target,tq) if a.create_aim_loops else []
    target.animation_data.action = None
    for pb in target.pose.bones:
        pb.matrix_basis.identity()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in target_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.export_scene.gltf(filepath=str(output_path),export_format='GLB',use_selection=True,
        export_yup=True,export_apply=False,export_animations=True,export_animation_mode='NLA_TRACKS',
        export_nla_strips=True,export_force_sampling=True,export_frame_range=False,
        export_anim_slide_to_zero=True,export_skins=True,export_def_bones=False,
        export_materials='EXPORT',export_extras=True,export_tangents=True)
    tangent_report = repair_tangents(output_path)
    if a.output_blend:
        for obj in list(source_objects):
            bpy.data.objects.remove(obj,do_unlink=True)
        activate(target,action)
        scene.frame_start,scene.frame_end = 1,math.ceil(last_frame)
        scene.frame_set(1)
        for helper in bpy.data.objects:
            if helper.name.startswith('Icosphere'):
                helper.hide_render = helper.hide_viewport = True
        bpy.ops.file.pack_all()
        blend_path = Path(a.output_blend).resolve()
        blend_path.parent.mkdir(parents=True,exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    report = {'source_fbx':str(source_path),'target_glb':str(target_path),'output_glb':str(output_path),
        'source_action':source_action_name,'clip_name':a.clip_name,'replaced_existing':bool(replacing),
        'preserved_target_clips':[n for n in original_clips if n!=a.clip_name],
        'source_fps':source_fps,'output_fps':a.fps,'duration_seconds':duration,'samples':frame_count,
        'target_bones':len(target.data.bones),'mapped_bones':len(mapping),
        'unmapped_target_bones':[b.name for b in target.data.bones if b.name not in mapping],
        'unmapped_source_bones':unmapped_source,'bone_mapping_and_rest_corrections':corrections,
        'pelvis_vertical_scale_ratio':height_ratio,'horizontal_pelvis_displacement_removed':True,
        'pelvis_vertical_offset_range_m':[min(vertical_offsets),max(vertical_offsets)],
        'wrist_distance_range_m':[min(wrist_distances),max(wrist_distances)],
        'local_derived_clips':local_clips,
        'pose_samples':pose_samples,'tangent_repair':tangent_report,
        'method':'Anatomical body-space rotations; virtual rest T-pose swing alignment preserving roll; target-length FK; vertical pelvis displacement only',
        'limitations':['No weapon-grip IK; inspect hands and shoulders for chibi proportions.',
                       'Ground-contact IK is not solved.',
                       'Uniform non-mirrored armature object transforms only.']}
    report_path = Path(a.report).resolve() if a.report else output_path.with_suffix('.retarget.json')
    report_path.parent.mkdir(parents=True,exist_ok=True)
    report_path.write_text(json.dumps(report,indent=2))
    print('MIXAMO_RETARGET_COMPLETE',json.dumps({key:report[key] for key in
        ('output_glb','clip_name','duration_seconds','mapped_bones','target_bones','wrist_distance_range_m')}))
    print('REPORT',str(report_path))


if __name__=='__main__':
    main()
