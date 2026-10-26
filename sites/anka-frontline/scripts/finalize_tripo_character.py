"""Local, zero-credit game preparation of a Tripo animated GLB in Blender.

Normalizes five clip names, keeps skin weights, limits geometry to 20k triangles,
sets +Z forward / +Y up in glTF, and puts a 2m-tall character on the ground.
The original Tripo GLB and all account/task records are preserved separately.
"""
import bpy
import sys
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
args=sys.argv[sys.argv.index('--')+1:]
source=Path(args[0]).resolve()
identifier=args[1]
rotation=float(args[2]) if len(args)>2 else -90
output=ROOT/'assets/characters/tripo'/f'{identifier}_animated.glb'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
scene=bpy.context.scene
scene.render.fps=30
bpy.ops.import_scene.gltf(filepath=str(source))
objects=list(bpy.context.selected_objects)
for helper in bpy.data.objects:
    if helper.name.startswith('Icosphere') and helper not in objects:
        helper.hide_render=True
        helper.hide_viewport=True
rigs=[o for o in objects if o.type=='ARMATURE']
meshes=[o for o in objects if o.type=='MESH']
if len(rigs)!=1 or not meshes:
    raise RuntimeError(f'Unexpected import: {len(rigs)} rigs / {len(meshes)} meshes')
rig=rigs[0]
rig.name=identifier+'_Rig'
for mesh in meshes:
    mesh.name=identifier+'_Body'
original_actions=list(bpy.data.actions)
clip_map={name.lower():name for name in ['Idle','Walk','Run','Jump','Shoot']}
for action in original_actions:
    name=action.name.lower().split('|')[-1]
    if name not in clip_map:
        raise RuntimeError(f'Unexpected Tripo motion: {action.name}')
    action.name=clip_map[name]
    action.use_fake_user=True
if set(a.name for a in original_actions)!=set(clip_map.values()):
    raise RuntimeError('Missing one or more of the five generated motions')
rig.animation_data.action=None
for track in list(rig.animation_data.nla_tracks):
    rig.animation_data.nla_tracks.remove(track)
for bone in rig.pose.bones:
    bone.matrix_basis.identity()
rig.data.pose_position='REST'
bpy.context.view_layer.update()

def tri_count(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)

before=sum(tri_count(o) for o in meshes)
budget=19800
if before>20000:
    for obj in meshes:
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        mod=obj.modifiers.new('Local game mesh optimization','DECIMATE')
        mod.ratio=budget/before
        mod.use_collapse_triangulate=True
        # Optimize bind geometry before the armature deforms it.
        while obj.modifiers.find(mod.name)>0:
            bpy.ops.object.modifier_move_up(modifier=mod.name)
        bpy.ops.object.modifier_apply(modifier=mod.name)
after=sum(tri_count(o) for o in meshes)
if after>20000:
    raise RuntimeError(f'Face budget not met: {after}')
for obj in meshes:
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)

# The source roughness estimate makes hair and cloth glossy. Keep the generated
# base/normal/metal maps, and use a consistent soft stylized surface roughness.
for mat in {m for obj in meshes for m in obj.data.materials if m}:
    if not mat.use_nodes:
        continue
    shader=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if shader:
        for link in list(shader.inputs['Roughness'].links):
            mat.node_tree.links.remove(link)
        shader.inputs['Roughness'].default_value=.58
        mat['source']='Tripo CN, original base color / normal / metal maps'
        mat['local_adjustment']='roughness 0.58 for cloth, skin and stylized hair'

roots=[o for o in objects if o.parent not in objects]
root=bpy.data.objects.new(identifier,None)
scene.collection.objects.link(root)
for obj in roots:
    obj.parent=root
root.rotation_euler.z=math.radians(rotation)
bpy.context.view_layer.update()
points=[obj.matrix_world@Vector(v) for obj in meshes for v in obj.bound_box]
mins=Vector(tuple(min(v[i] for v in points) for i in range(3)))
maxs=Vector(tuple(max(v[i] for v in points) for i in range(3)))
scale=2.0/(maxs.z-mins.z)
root.scale=(scale,)*3
root.location=(-(mins.x+maxs.x)*scale/2,-(mins.y+maxs.y)*scale/2,-mins.z*scale)
root['generator']='Tripo CN'
root['forward']='+Z in GLB'
root['up']='+Y in GLB'
root['height_m']=2.0
root['source_glb']=str(source.relative_to(ROOT))
root['clips']='Idle, Walk, Run, Jump, Shoot'
rig['skeleton']='Mixamo-compatible / Tripo rig v3.0-20260909'
rig['movement']='In-place motion; drive world movement from the game'
rig.data.pose_position='POSE'
for action in original_actions:
    track=rig.animation_data.nla_tracks.new()
    track.name=action.name
    start,end=action.frame_range
    strip=track.strips.new(action.name,1,action)
    strip.action_frame_start=start
    strip.action_frame_end=end
    strip.extrapolation='NOTHING'
    track.mute=True
rig.animation_data.action=None
bpy.context.view_layer.update()

# Keep the editable source with its original high-resolution texture images.
idle=bpy.data.actions['Idle']
rig.animation_data.action=idle
if idle.slots:
    rig.animation_data.action_slot=idle.slots[0]
scene.frame_start=1
scene.frame_end=math.ceil(idle.frame_range[1])
scene.frame_set(1)
bpy.ops.file.pack_all()
blend=ROOT/'source'/f'anka_tripo_{identifier}.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
rig.animation_data.action=None
for bone in rig.pose.bones:
    bone.matrix_basis.identity()

# A 2K texture tier is plenty for these 20k-triangle WebGL characters; preserve
# the full-resolution source above and original Tripo output for later exports.
texture_sizes=[]
for image in bpy.data.images:
    width,height=image.size
    if width>2048 or height>2048:
        factor=2048/max(width,height)
        image.scale(round(width*factor),round(height*factor))
    if image.size[0] and image.size[1]:
        texture_sizes.append({'name':image.name,'width':image.size[0],'height':image.size[1]})
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for obj in objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(
    filepath=str(output),export_format='GLB',use_selection=True,
    export_yup=True,export_apply=False,export_animations=True,
    export_animation_mode='NLA_TRACKS',export_nla_strips=True,
    export_force_sampling=True,export_frame_range=False,
    export_anim_slide_to_zero=True,export_skins=True,export_def_bones=False,
    export_materials='EXPORT',export_extras=True,export_tangents=True,
)
report={'id':identifier,'source':str(source.relative_to(ROOT)),
        'file':str(output.relative_to(ROOT)),'blend':str(blend.relative_to(ROOT)),
        'raw_triangles':before,'triangles':after,'bytes':output.stat().st_size,
        'bones':len(rig.data.bones),'height_m':2.0,'blender_turn_z_deg':rotation,
        'clips':[a.name for a in original_actions],'web_texture_sizes':texture_sizes,
        'local_changes':['Decimate to <20k triangles with skin weights and UVs',
                         'Normalize to 2m, +Y up / +Z forward, feet origin',
                         'Roughness 0.58 with source base/normal/metal maps',
                         'Stable animation clip names',
                         '2K web textures; high-resolution textures kept in source blend']}
(ROOT/'reports/tripo'/f'{identifier}-finalization.json').write_text(json.dumps(report,indent=2))
print('ANKA_FINALIZED',json.dumps(report))
