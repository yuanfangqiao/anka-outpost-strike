"""Enable the installed Blender bridge and persist only addon preferences."""
import bpy
import addon_utils

addon_utils.enable('blender_mcp', default_set=True, persistent=True)
preferences = bpy.context.preferences.addons.get('blender_mcp')
if preferences:
    preferences.preferences.telemetry_consent = False
bpy.ops.wm.save_userpref()
print('ANKA: Blender MCP enabled; localhost:9876; telemetry disabled.')
