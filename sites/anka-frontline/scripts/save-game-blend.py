"""Save the final GLBs as editable, packed Blender sources with all 16 actions."""
from pathlib import Path
import bpy

root = Path(__file__).resolve().parent.parent
for name in ('male_scout', 'female_striker'):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(root/'assets/characters/mixamo'/f'{name}_aim.glb'))
    rig = next(obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE')
    for action in bpy.data.actions:
        action.use_fake_user = True
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    idle = bpy.data.actions.get('Idle')
    rig.animation_data.action = idle
    if idle and idle.slots:
        rig.animation_data.action_slot = idle.slots[0]
    bpy.context.scene.frame_set(1)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1
    bpy.ops.file.pack_all()
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.wm.save_as_mainfile(filepath=str(root/'source'/f'{name}_game.blend'))
    print(name, 'saved with', len(bpy.data.actions), 'actions')
