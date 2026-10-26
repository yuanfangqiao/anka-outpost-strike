"""Place both finished Tripo characters in the existing local review studio."""
import bpy
import json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'source/anka_characters.blend'))
# Remove only the prototype character collections from this loaded copy.
for name in ['male_scout','female_striker']:
    col=bpy.data.collections.get(name)
    if col:
        for obj in list(col.all_objects):
            bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.collections.remove(col)
for action in list(bpy.data.actions):
    if not action.users:
        bpy.data.actions.remove(action)

rigs=[]
for identifier,x in [('male_scout',-.74),('female_striker',.68)]:
    path=ROOT/'source'/f'anka_tripo_{identifier}.blend'
    with bpy.data.libraries.load(str(path),link=False) as (source,target):
        target.objects=source.objects
    objects=[o for o in target.objects if o]
    collection=bpy.data.collections.new('Tripo / '+identifier)
    bpy.context.scene.collection.children.link(collection)
    for obj in objects:
        # glTF's Blender importer creates a hidden custom bone-shape Icosphere.
        # Appending into a new view layer drops hide_set, so hide it explicitly.
        if obj.name.startswith('Icosphere'):
            obj.hide_render=True
            obj.hide_viewport=True
        collection.objects.link(obj)
    stage_root=bpy.data.objects.new(identifier+'_Display',None)
    collection.objects.link(stage_root)
    for obj in objects:
        if obj.parent not in objects:
            obj.parent=stage_root
    stage_root.location.x=x
    rig=next(o for o in objects if o.type=='ARMATURE')
    rig['character_id']=identifier
    rigs.append(rig)

scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=48
scene.cycles.use_denoising=True
scene.render.resolution_x=1600
scene.render.resolution_y=1200
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.fps=30
camera=scene.camera
camera.data.ortho_scale=3.55

def play(name,frame):
    for rig in rigs:
        track=next(t for t in rig.animation_data.nla_tracks if t.name==name)
        action=track.strips[0].action
        rig.animation_data.action=action
        rig.animation_data.action_slot=action.slots[0]
    scene.frame_set(frame)

def viewpoint(position):
    camera.location=position
    camera.rotation_euler=(Vector((0,0,1.0))-camera.location).to_track_quat('-Z','Y').to_euler()

play('Idle',1)
viewpoint((2.5,-8.0,2.8))
scene.frame_start=1
scene.frame_end=460
scene['README']='Tripo CN characters, v3.1 geometry / v3.0 Mixamo rigs. Each rig has Idle, Walk, Run, Jump, Shoot NLA tracks (muted by default); select an action to preview it. Source images and all paid task IDs are in reports/tripo. Game GLBs use 2K textures; this scene keeps original high-resolution textures.'
text=bpy.data.texts.new('README - Tripo characters')
text.write(scene['README'])
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=4.8
            area.spaces.active.region_3d.view_location=Vector((0,0,1.0))
            area.spaces.active.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
            area.spaces.active.shading.type='MATERIAL'
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'source/anka_tripo_characters.blend'),compress=True)

folder=ROOT/'renders/tripo'
folder.mkdir(parents=True,exist_ok=True)
for name,frame,pos in [('duo-idle',1,(2.5,-8,2.8)),('duo-run',10,(2.5,-8,2.8)),('duo-back',1,(-2.3,8,2.8))]:
    play('Run' if name=='duo-run' else 'Idle',frame)
    viewpoint(pos)
    scene.render.filepath=str(folder/f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('ANKA_TRIPO_RENDERED',name,flush=True)
