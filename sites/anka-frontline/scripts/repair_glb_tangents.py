"""Normalize UV tangents, including zeros at a few collapsed UV vertices.
No mesh positions, normals, UVs, textures, bone weights or animation are changed.
"""
from pathlib import Path
import struct
import json
import math

reports=[]
for identifier in ['male_scout','female_striker']:
    path=Path('assets/characters/tripo')/f'{identifier}_animated.glb'
    data=bytearray(path.read_bytes())
    size=struct.unpack_from('<I',data,12)[0]
    document=json.loads(data[20:20+size])
    binary_start=20+size+8
    fixed=0
    seen=set()
    for mesh in document.get('meshes',[]):
        for primitive in mesh['primitives']:
            attrs=primitive['attributes']
            if 'TANGENT' not in attrs or attrs['TANGENT'] in seen:
                continue
            seen.add(attrs['TANGENT'])
            tangent=document['accessors'][attrs['TANGENT']]
            normal=document['accessors'][attrs['NORMAL']]
            tv=document['bufferViews'][tangent['bufferView']]
            nv=document['bufferViews'][normal['bufferView']]
            assert tangent['componentType']==normal['componentType']==5126
            toffset=binary_start+tv.get('byteOffset',0)+tangent.get('byteOffset',0)
            noffset=binary_start+nv.get('byteOffset',0)+normal.get('byteOffset',0)
            for i in range(tangent['count']):
                pos=toffset+i*tv.get('byteStride',16)
                x,y,z,w=struct.unpack_from('<4f',data,pos)
                length=math.sqrt(x*x+y*y+z*z)
                if abs(length-1)<1e-5:
                    continue
                if length<1e-8:
                    nx,ny,nz=struct.unpack_from('<3f',data,noffset+i*nv.get('byteStride',12))
                    if abs(nx)<.8:
                        x,y,z=0,nz,-ny
                    else:
                        x,y,z=-nz,0,nx
                    length=math.sqrt(x*x+y*y+z*z)
                    if length<1e-8:
                        raise ValueError('Degenerate normal at a tangent repair vertex')
                struct.pack_into('<4f',data,pos,x/length,y/length,z/length,-1 if w<0 else 1)
                fixed+=1
    path.write_bytes(data)
    reports.append({'file':str(path),'repaired_tangents':fixed})
Path('reports/tripo/tangent-repair.json').write_text(json.dumps(reports,indent=2))
print(json.dumps(reports,indent=2))
