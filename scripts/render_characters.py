"""Render review views from the authored .blend, without touching exports."""
import bpy
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
scene=bpy.context.scene
scene.cycles.samples=40
scene.render.resolution_x=1600
scene.render.resolution_y=1200
camera=scene.camera
views=[('duo', (2.8,-8,3.0), (0,0,1.0),3.6),
       ('front', (0,-8,2.0), (0,0,1.0),3.65),
       ('back', (-2.5,8,2.7), (0,0,1.0),3.65)]
for name,pos,target,scale in views:
    camera.location=pos
    camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=scale
    scene.render.filepath=str(ROOT/'renders'/f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('ANKA_RENDERED',name,flush=True)
