"""Create explicitly local, procedural game actions on the existing character rig.

Blender --background --factory-startup --python scripts/procedural-character-actions.py --
  --target-glb assets/characters/mixamo/male_scout_aim.glb
  --report reports/mixamo/male-procedural.json --review-dir reports/mixamo/male-actions

Existing clips, meshes, texture images, bone hierarchy and wrapper transforms are
preserved. With no --output-glb, replaces target only after a successful export;
the original input is first backed up beside the report.
"""
import argparse
import importlib.util
import json
import math
import shutil
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

spec = importlib.util.spec_from_file_location("retarget_helpers", Path(__file__).with_name("mixamo-retarget.py"))
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)
canonical, activate, track_action = helpers.canonical, helpers.activate, helpers.track_action

UP = Vector((0, 0, 1))
RIGHT = Vector((1, 0, 0))
FRONT = Vector((0, -1, 0))


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x*x*(3-2*x)


def envelope(t, start, peak, end):
    return smooth((t-start)/(peak-start)) if t < peak else 1-smooth((t-peak)/(end-peak))


class Pose:
    """FK state independent from Blender evaluation; angles are global quaternion swings."""
    def __init__(self, rig, snapshot):
        self.rig = rig
        self.bones = helpers.lookup(rig)
        self.names = {key: bone.name for key, bone in self.bones.items()}
        self.ordered = sorted(rig.data.bones, key=lambda b: len(b.parent_recursive))
        self.relative = {b.name: (b.parent.matrix_local.inverted() @ b.matrix_local
                                 if b.parent else b.matrix_local.copy()) for b in self.ordered}
        self.state = {name: {key: value.copy() for key, value in values.items()}
                      for name, values in snapshot.items()}
        self.fk()

    def fk(self):
        self.matrices = {}
        for bone in self.ordered:
            state = self.state[bone.name]
            basis = Matrix.LocRotScale(state['location'], state['rotation'], state['scale'])
            parent = self.matrices[bone.parent.name] if bone.parent else Matrix.Identity(4)
            self.matrices[bone.name] = parent @ self.relative[bone.name] @ basis

    def world(self, key):
        return self.rig.matrix_world @ self.matrices[self.names[key]]

    def pos(self, key):
        return self.world(key).translation

    def quat(self, key):
        return helpers.rotation(self.world(key))

    def set_quat(self, key, desired):
        name = self.names[key]
        bone = self.bones[key]
        parent = self.rig.matrix_world @ self.matrices[bone.parent.name] if bone.parent else self.rig.matrix_world
        q = helpers.rotation(self.relative[name]).inverted() @ helpers.rotation(parent).inverted() @ desired
        q.normalize()
        self.state[name]['rotation'] = q
        self.fk()

    def rotate(self, key, axis, degrees):
        self.set_quat(key, Quaternion(axis.normalized(), math.radians(degrees)) @ self.quat(key))

    def set_hips(self, position):
        name = self.names['hips']
        bone = self.bones['hips']
        parent = self.matrices[bone.parent.name] if bone.parent else Matrix.Identity(4)
        desired = self.rig.matrix_world.inverted() @ Matrix.LocRotScale(position, self.quat('hips'), Vector((1,1,1)))
        basis = self.relative[name].inverted() @ parent.inverted() @ desired
        self.state[name]['location'] = basis.translation
        self.fk()

    def shift(self, vector):
        self.set_hips(self.pos('hips') + vector)

    def ik(self, upper, lower, end, target, pole, end_q=None):
        """Analytic two-bone IK retaining original bone lengths and axial roll."""
        a, b, c = self.pos(upper), self.pos(lower), self.pos(end)
        l1, l2 = (b-a).length, (c-b).length
        direction = target-a
        distance = max(abs(l1-l2)+1e-5, min(direction.length, (l1+l2)*.997))
        direction.normalize()
        bend = pole-a
        bend -= direction*bend.dot(direction)
        if bend.length < 1e-5:
            bend = FRONT-direction*FRONT.dot(direction)
        bend.normalize()
        along = (l1*l1-l2*l2+distance*distance)/(2*distance)
        elbow = a+direction*along+bend*math.sqrt(max(0,l1*l1-along*along))
        self.set_quat(upper, (b-a).rotation_difference(elbow-a) @ self.quat(upper))
        b, c = self.pos(lower), self.pos(end)
        goal = a+direction*distance
        self.set_quat(lower, (c-b).rotation_difference(goal-b) @ self.quat(lower))
        if end_q is not None:
            self.set_quat(end, end_q)

    def apply(self, previous=None):
        for name, state in self.state.items():
            pb = self.rig.pose.bones[name]
            pb.rotation_mode = 'QUATERNION'
            pb.location = state['location']
            q = state['rotation'].copy()
            if previous and name in previous and q.dot(previous[name]) < 0:
                q.negate()
            pb.rotation_quaternion = q
            pb.scale = state['scale']
            if previous is not None:
                previous[name] = q
        bpy.context.view_layer.update()


def snapshot(rig, action):
    activate(rig, action)
    bpy.context.scene.frame_set(round(action.frame_range[0]))
    bpy.context.view_layer.update()
    return {pb.name: {'location': pb.location.copy(), 'rotation': pb.rotation_quaternion.copy(),
                      'scale': pb.scale.copy()} for pb in rig.pose.bones}


def mesh_bounds(meshes):
    """Actual evaluated skinned mesh bounds, vectorized in world space."""
    minimum, maximum = np.full(3, np.inf), np.full(3, -np.inf)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in meshes:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        coords = np.empty(len(mesh.vertices)*3, dtype=np.float64)
        mesh.vertices.foreach_get('co', coords)
        coords = coords.reshape((-1,3))
        transform = np.asarray(evaluated.matrix_world, dtype=float)
        world = coords @ transform[:3,:3].T + transform[:3,3]
        minimum = np.minimum(minimum, world.min(axis=0))
        maximum = np.maximum(maximum, world.max(axis=0))
        evaluated.to_mesh_clear()
    return minimum, maximum


def support_legs(pose, feet, amount, phase=0, walk=False):
    pose.shift(Vector((0, .045, -amount)))
    pose.rotate('spine', RIGHT, 9)
    pose.rotate('spine1', RIGHT, -5)
    for i, side in enumerate(('left','right')):
        target, q = feet[side]
        target = target.copy()
        if walk:
            cycle = phase+i*math.pi
            target += FRONT*(.13*math.cos(cycle))
            target.z += .055*max(0,math.sin(cycle))
        pole = pose.pos(side+'upleg')+FRONT*.65+UP*.05
        pose.ik(side+'upleg',side+'leg',side+'foot',target,pole,q)


def pose_action(rig, aim, idle, feet, name, t):
    pose = Pose(rig, idle if name in ('Victory','Death') else aim)
    hips = pose.pos('hips').copy()
    phase = t*2*math.pi
    if name=='CrouchIdle':
        support_legs(pose, feet, .255+.003*math.sin(phase))
        pose.rotate('spine2', RIGHT, .6*math.sin(phase))
    elif name=='CrouchWalk':
        support_legs(pose, feet, .23+.012*(1-math.cos(phase*2)), phase, True)
        pose.rotate('spine2', UP, 2.5*math.sin(phase))
    elif name=='Reload':
        hands = {side:(pose.pos(side+'hand'),pose.quat(side+'hand')) for side in ('left','right')}
        reach = envelope(t,.10,.34,.72)
        insert = envelope(t,.48,.66,.86)
        pose.rotate('spine2', RIGHT, -5*envelope(t,.02,.3,.95))
        for side in ('left','right'):
            position,q = hands[side]
            if side=='left':
                target=position+Vector((.055,.045,-.27))*reach+Vector((.02,-.045,-.07))*insert
                q=Quaternion(RIGHT,math.radians(18*reach-12*insert))@q
            else:
                target=position+Vector((0,.025,-.035))*reach
            pole=pose.pos(side+'arm')+Vector((.3 if side=='left' else -.3,-.15,-.45))
            pose.ik(side+'arm',side+'forearm',side+'hand',target,pole,q)
        pose.rotate('head', RIGHT, 7*reach)
    elif name=='Hurt':
        kick = envelope(t,0,.18,1)
        pose.rotate('spine', RIGHT, -10*kick)
        pose.rotate('spine2', UP, 4*kick)
        pose.rotate('head', RIGHT, -5*kick)
        pose.shift(UP*(-.022*kick))
    elif name=='Victory':
        rise = envelope(t,.02,.28,.98)
        wave = math.sin(t*6*math.pi)*rise
        for side, sign in (('left',1),('right',-1)):
            hand=pose.pos(side+'hand')
            q=pose.quat(side+'hand')
            shoulder=pose.pos(side+'arm')
            desired=shoulder+Vector((sign*.30, -.05, .34+.025*wave*sign))
            target=hand.lerp(desired,rise)
            pole=shoulder+Vector((sign*.5,-.22,.13))
            pose.ik(side+'arm',side+'forearm',side+'hand',target,pole,
                    Quaternion(FRONT,math.radians(sign*65*rise+15*wave))@q)
        pose.rotate('spine2', UP, 5*math.sin(t*4*math.pi)*rise)
        pose.rotate('head', FRONT, 4*wave)
        pose.shift(UP*(.045*max(0,math.sin(t*4*math.pi))*rise))
    elif name=='Roll':
        tuck = smooth(t/.13)*(1-smooth((t-.87)/.13))
        support_legs(pose, feet, .20*tuck)
        for side,sign in (('left',1),('right',-1)):
            foot,q=pose.pos(side+'foot'),pose.quat(side+'foot')
            folded=pose.pos('hips')+Vector((sign*.13,-.08,-.16))
            pole=pose.pos(side+'upleg')+FRONT*.65+UP*.1
            pose.ik(side+'upleg',side+'leg',side+'foot',foot.lerp(folded,tuck),pole,q)
        for side,sign in (('left',1),('right',-1)):
            hand,q=pose.pos(side+'hand'),pose.quat(side+'hand')
            target=pose.pos('spine2')+Vector((sign*.12,-.18,-.05))
            pole=pose.pos(side+'arm')+Vector((sign*.45,-.1,-.2))
            pose.ik(side+'arm',side+'forearm',side+'hand',hand.lerp(target,tuck),pole,q)
        pose.rotate('head',RIGHT,10*tuck)
        angle = 360*smooth((t-.10)/.80)
        q=Quaternion(RIGHT,math.radians(angle))
        pivot=Vector((hips.x,hips.y,1.02))
        root=pose.pos('hips')
        pose.set_hips(pivot+q@(root-pivot))
        pose.set_quat('hips',q@pose.quat('hips'))
    elif name=='Death':
        fall = smooth((t-.05)/.70)
        slack=smooth((t-.18)/.58)
        for side,sign in (('left',1),('right',-1)):
            hand,q=pose.pos(side+'hand'),pose.quat(side+'hand')
            target=hips+Vector((sign*.34,-.05,-.07))
            pole=pose.pos(side+'arm')+Vector((sign*.55,-.15,-.3))
            pose.ik(side+'arm',side+'forearm',side+'hand',hand.lerp(target,slack),pole,q)
        pose.rotate('head', FRONT, 16*slack)
        pose.rotate('head', RIGHT, 8*slack)
        for side,sign in (('left',1),('right',-1)):
            for upper,end in ((side+'upleg',side+'leg'),(side+'leg',side+'foot')):
                direction=(pose.pos(end)-pose.pos(upper)).normalized()
                down=Vector((sign*.035,-.025,-1)).normalized()
                change=direction.rotation_difference(down)
                desired=change@pose.quat(upper)
                pose.set_quat(upper,pose.quat(upper).slerp(desired,slack))
        pose.rotate('hips', RIGHT, -94*fall)
        pose.rotate('hips', FRONT, 5*slack)
        pose.shift(UP*(-.07*fall))
    else:
        raise ValueError(name)
    return pose


def render_review(rig, actions, output_dir):
    """One actual evaluated pose per clip with a ground plane."""
    output_dir.mkdir(parents=True, exist_ok=True)
    for obj in bpy.data.objects:
        if obj.name.startswith('Icosphere'):
            obj.hide_render = True
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.samples=16
    scene.cycles.use_denoising=True
    scene.render.resolution_x=480
    scene.render.resolution_y=480
    scene.render.resolution_percentage=100
    world=bpy.data.worlds.new('Action Review World')
    world.use_nodes=True
    background=next(node for node in world.node_tree.nodes if node.type=='BACKGROUND')
    background.inputs['Color'].default_value=(.16,.20,.26,1)
    background.inputs['Strength'].default_value=.5
    scene.world=world
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.004))
    plane=bpy.context.object
    mat=bpy.data.materials.new('Review Ground')
    mat.diffuse_color=(.25,.29,.34,1)
    plane.data.materials.append(mat)
    for position,power in [((-3,-4,5),550),((4,-1,3),300),((1,3,4),500)]:
        data=bpy.data.lights.new('Review Softbox','AREA')
        data.energy=power
        data.size=4
        obj=bpy.data.objects.new('Review Softbox',data)
        scene.collection.objects.link(obj)
        obj.location=position
        obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Review Camera')
    camera=bpy.data.objects.new('Review Camera',data)
    scene.collection.objects.link(camera)
    scene.camera=camera
    camera.location=(3,-6,2.6)
    camera.rotation_euler=(Vector((0,0,.9))-camera.location).to_track_quat('-Z','Y').to_euler()
    data.type='ORTHO'
    data.ortho_scale=2.65
    fractions={'CrouchIdle':.25,'CrouchWalk':.25,'Roll':.46,'Victory':.35,'Reload':.34,'Hurt':.18,'Death':1}
    for name,action in actions.items():
        activate(rig,action)
        frame=action.frame_range[0]+(action.frame_range[1]-action.frame_range[0])*fractions[name]
        helpers.set_frame(frame)
        scene.render.filepath=str(output_dir/(name+'.png'))
        bpy.ops.render.render(write_still=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target-glb',required=True)
    parser.add_argument('--output-glb')
    parser.add_argument('--report',required=True)
    parser.add_argument('--review-dir')
    parser.add_argument('--replace',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    target_path=Path(args.target_glb).resolve()
    output_path=Path(args.output_glb).resolve() if args.output_glb else target_path
    report_path=Path(args.report).resolve()
    report_path.parent.mkdir(parents=True,exist_ok=True)
    backup=report_path.with_name(target_path.stem+'-source-9clips.glb')
    if not backup.exists():
        shutil.copy2(target_path,backup)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    bpy.context.scene.render.fps=30
    bpy.ops.import_scene.gltf(filepath=str(target_path))
    target_objects=set(bpy.context.selected_objects)
    rig=next(obj for obj in target_objects if obj.type=='ARMATURE')
    helpers.check_transform(rig)
    world_before=[list(row) for row in rig.matrix_world]
    mesh_objects=[obj for obj in target_objects if obj.type=='MESH' and any(m.type=='ARMATURE' for m in obj.modifiers)]
    for track in rig.animation_data.nla_tracks:
        track.mute=True
    actions={action.name:action for action in bpy.data.actions}
    idle=snapshot(rig,actions['Idle'])
    aim=snapshot(rig,actions['AimIdle'])
    for pb in rig.pose.bones:
        pb.rotation_mode='QUATERNION'
    rig.animation_data.action=None
    aim_pose=Pose(rig,aim)
    aim_pose.apply()
    original_bounds=mesh_bounds(mesh_objects)
    ground_offset=max(0,-original_bounds[0][2])
    feet={side:(aim_pose.pos(side+'foot'),aim_pose.quat(side+'foot')) for side in ('left','right')}
    for position,rotation in feet.values():
        position.z+=ground_offset
    specs=[('CrouchIdle',2.0,True),('CrouchWalk',1.0,True),('Roll',.9,False),
           ('Victory',2.5,False),('Reload',1.5,False),('Hurt',.5,False),('Death',1.4,False)]
    report={'source':'Local procedural Blender animation; no downloaded motion data',
            'target':str(target_path),'output':str(output_path),'backup':str(backup),
            'fps':30,'existing_clips':list(actions),'bone_count':len(rig.data.bones),
            'root_motion':'All horizontal travel is in-place. Roll needs runtime horizontal travel.',
            'ground_method':'Full evaluated skinned mesh minimum Z compensated each frame; crouch leg analytic IK.',
            'clips':[]}
    generated={}
    for name,duration,loop in specs:
        existing=actions.get(name)
        if existing and not args.replace:
            raise ValueError(name+' already exists; pass --replace')
        if existing:
            for track in list(rig.animation_data.nla_tracks):
                if track.name==name:
                    rig.animation_data.nla_tracks.remove(track)
            bpy.data.actions.remove(existing)
        action=bpy.data.actions.new(name)
        action.use_fake_user=True
        activate(rig,action)
        # Disable evaluation of an incomplete action while authoring frames.
        rig.animation_data.action=None
        previous={}
        ground_values=[]
        hip_positions=[]
        bbox=[]
        frame_count=round(duration*30)+1
        for index in range(frame_count):
            t=index/(frame_count-1)
            pose=pose_action(rig,aim,idle,feet,name,t)
            pose.apply(previous)
            minimum,maximum=mesh_bounds(mesh_objects)
            # Grounded actions keep the lowest boot/contact skin at the floor.
            # The roll's rigid root rotates around the body center before this
            # contact solve, avoiding rotation around the toes or world origin.
            dz=-float(minimum[2])+.002
            pose.shift(UP*dz)
            pose.apply(previous)
            minimum,maximum=mesh_bounds(mesh_objects)
            ground_values.append(float(minimum[2]))
            hip_positions.append(list(pose.pos('hips')))
            bbox.append([minimum.tolist(),maximum.tolist()])
            activate(rig,action)
            for pb in rig.pose.bones:
                pb.keyframe_insert('rotation_quaternion',frame=index+1,group=pb.name)
                if canonical(pb.name)=='hips':
                    pb.keyframe_insert('location',frame=index+1,group=pb.name)
            rig.animation_data.action=None
        track_action(rig,action,name)
        generated[name]=action
        report['clips'].append({'name':name,'duration':duration,'loop':loop,'samples':frame_count,
                                'minimum_skin_height_range': [min(ground_values),max(ground_values)],
                                'hips_first':hip_positions[0],'hips_last':hip_positions[-1],
                                'pose_bounds_first_middle_last':[bbox[0],bbox[len(bbox)//2],bbox[-1]],
                                'provenance':'Local procedural; not Mixamo'})
    rig.animation_data.action=None
    for pb in rig.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    if max(abs(rig.matrix_world[i][j]-world_before[i][j]) for i in range(4) for j in range(4))>1e-6:
        raise AssertionError('Armature object transform changed')
    bpy.ops.object.select_all(action='DESELECT')
    for obj in target_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=rig
    temporary=output_path.with_name(output_path.stem+'-procedural-temp.glb')
    bpy.ops.export_scene.gltf(filepath=str(temporary),export_format='GLB',use_selection=True,
        export_yup=True,export_apply=False,export_animations=True,export_animation_mode='NLA_TRACKS',
        export_nla_strips=True,export_force_sampling=True,export_frame_range=False,
        export_anim_slide_to_zero=True,export_skins=True,export_def_bones=False,
        export_materials='EXPORT',export_extras=True,export_tangents=True)
    report['tangent_repair']=helpers.repair_tangents(temporary)
    output_path.parent.mkdir(parents=True,exist_ok=True)
    temporary.replace(output_path)
    report_path.write_text(json.dumps(report,indent=2))
    print('PROCEDURAL_COMPLETE',str(output_path),flush=True)
    if args.review_dir:
        render_review(rig,generated,Path(args.review_dir).resolve())
    print('REVIEW_COMPLETE',flush=True)


if __name__=='__main__':
    main()
