"""Render an actual Tripo GLB from two axis-aligned views for visual QA."""
import bpy
import sys
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
args=sys.argv[sys.argv.index('--')+1:]
model_path=Path(args[0]).resolve()
identifier=args[1]
turn=float(args[2]) if len(args)>2 else 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(model_path))
objects=list(bpy.context.selected_objects)
roots=[o for o in objects if o.parent not in objects]
root=bpy.data.objects.new('Review normalization',None)
bpy.context.scene.collection.objects.link(root)
for o in roots:
    o.parent=root
root.rotation_euler.z=math.radians(turn)
bpy.context.view_layer.update()
meshes=[o for o in objects if o.type=='MESH']
points=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
mins=Vector(tuple(min(v[i] for v in points) for i in range(3)))
maxs=Vector(tuple(max(v[i] for v in points) for i in range(3)))
height=maxs.z-mins.z
scale=2.0/height
root.scale=(scale,)*3
root.location=(-(mins.x+maxs.x)*scale/2,-(mins.y+maxs.y)*scale/2,-mins.z*scale)
bpy.context.view_layer.update()

world=bpy.data.worlds.new('Review world')
world.use_nodes=True
background=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
background.inputs['Color'].default_value=(.32,.37,.43,1)
background.inputs['Strength'].default_value=.5
bpy.context.scene.world=world
for pos,energy,size in [((-3,-4,5),350,4),((4,-2,3),250,3),((0,3,4),500,3)]:
    data=bpy.data.lights.new('Review softbox','AREA')
    data.energy=energy
    data.shape='DISK'
    data.size=size
    obj=bpy.data.objects.new('Review softbox',data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location=pos
    obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.render.resolution_x=900
scene.render.resolution_y=1000
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
camera_data=bpy.data.cameras.new('Review camera')
camera=bpy.data.objects.new('Review camera',camera_data)
scene.collection.objects.link(camera)
camera_data.type='ORTHO'
camera_data.ortho_scale=2.38
scene.camera=camera
folder=ROOT/'renders/tripo'
folder.mkdir(parents=True,exist_ok=True)
for view,pos in [('z-front',(0,-5,1.0)),('x-front',(5,0,1.0))]:
    camera.location=pos
    camera.rotation_euler=(Vector((0,0,1))-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(folder/f'{identifier}-{view}.png')
    bpy.ops.render.render(write_still=True)
report={'file':str(model_path),'raw_blender_bounds':{'min':list(mins),'max':list(maxs)},'review_scale':scale,'rotation_deg':turn,'meshes':len(meshes),'armatures':len([o for o in objects if o.type=='ARMATURE'])}
(ROOT/'reports/tripo'/f'{identifier}-dimensions.json').write_text(json.dumps(report,indent=2))
print('ANKA_REVIEW',json.dumps(report))
