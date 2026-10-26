import bpy,sys,math,json
from pathlib import Path
from mathutils import Vector
root=Path('/Users/vitcou/workplace/anka-3d-game/anka-outpost-strike')
args=sys.argv[sys.argv.index('--')+1:]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.scene.render.fps=30
bpy.ops.import_scene.gltf(filepath=str(root/args[0]))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
action=next(a for a in bpy.data.actions if a.name==args[1])
rig.animation_data.action=action
rig.animation_data.action_slot=action.slots[0]
for t in rig.animation_data.nla_tracks:t.mute=True
for o in bpy.data.objects:
 if o.name.startswith('Icosphere'):o.hide_render=True
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
world=bpy.data.worlds.new('Review');world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.20,.26,.34,1);bg.inputs['Strength'].default_value=.45;scene.world=world
for pos,power in [((-3,-4,5),450),((4,-1,3),250),((1,3,4),500)]:
 d=bpy.data.lights.new('Softbox','AREA');d.energy=power;d.size=4
 o=bpy.data.objects.new('Softbox',d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('Camera');c=bpy.data.objects.new('Camera',d);scene.collection.objects.link(c);scene.camera=c
c.location=(2.4,-7,2.5);c.rotation_euler=(Vector((0,0,1.0))-c.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=2.6
for label,frame in [('first',action.frame_range[0]),('last',action.frame_range[1])]:
 scene.frame_set(round(frame));scene.render.filepath=str(root/'reports/mixamo'/f'{args[2]}-{label}.png');bpy.ops.render.render(write_still=True)
print('REVIEW_DONE')
