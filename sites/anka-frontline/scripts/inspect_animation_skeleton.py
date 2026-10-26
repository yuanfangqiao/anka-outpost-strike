"""Inspect GLB/FBX skeleton rest transforms without editing the input.

blender --background --factory-startup --python scripts/inspect_animation_skeleton.py \
  -- INPUT.glb --output reports/mixamo/skeleton.json
"""
import argparse
import json
import sys
from pathlib import Path
import bpy


def rows(matrix):
    return [[round(float(value), 9) for value in row] for row in matrix]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input')
    parser.add_argument('--output', required=True)
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    path = Path(options.input).resolve()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.context.scene.render.fps = 30
    if path.suffix.lower() == '.fbx':
        bpy.ops.import_scene.fbx(filepath=str(path), automatic_bone_orientation=False)
    elif path.suffix.lower() in ('.glb', '.gltf'):
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif path.suffix.lower() == '.blend':
        bpy.ops.wm.open_mainfile(filepath=str(path))
    else:
        raise ValueError('Expected GLB, glTF, FBX, or blend input')
    bpy.context.view_layer.update()
    result = {'file': str(path), 'blender': bpy.app.version_string,
              'fps': bpy.context.scene.render.fps, 'armatures': [], 'actions': []}
    for action in bpy.data.actions:
        result['actions'].append({'name': action.name, 'frames': list(action.frame_range),
                                  'slots': [slot.identifier for slot in action.slots]})
    for rig in [o for o in bpy.data.objects if o.type == 'ARMATURE']:
        record = {'name': rig.name, 'world_matrix': rows(rig.matrix_world),
                  'parent': rig.parent.name if rig.parent else None,
                  'bone_count': len(rig.data.bones), 'bones': [], 'nla': []}
        for bone in rig.data.bones:
            world = rig.matrix_world @ bone.matrix_local
            relative = (bone.parent.matrix_local.inverted() @ bone.matrix_local
                        if bone.parent else bone.matrix_local)
            record['bones'].append({
                'name': bone.name, 'parent': bone.parent.name if bone.parent else None,
                'length': bone.length, 'use_deform': bone.use_deform,
                'head_local': list(bone.head_local), 'tail_local': list(bone.tail_local),
                'head_world': list(rig.matrix_world @ bone.head_local),
                'tail_world': list(rig.matrix_world @ bone.tail_local),
                'rest_armature': rows(bone.matrix_local), 'rest_world': rows(world),
                'rest_parent_relative': rows(relative),
            })
        if rig.animation_data:
            record['current_action'] = rig.animation_data.action.name if rig.animation_data.action else None
            for track in rig.animation_data.nla_tracks:
                record['nla'].append({'name': track.name, 'muted': track.mute,
                                      'actions': [s.action.name for s in track.strips if s.action]})
        result['armatures'].append(record)
    output = Path(options.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2))
    print(json.dumps({'output': str(output), 'armatures': [
        {'name': a['name'], 'bones': a['bone_count']} for a in result['armatures']],
        'actions': [a['name'] for a in result['actions']]}, indent=2))


if __name__ == '__main__':
    main()
