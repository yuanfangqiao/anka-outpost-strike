"""Small real MCP client for this session (new tools load after Codex restart)."""
import argparse
import asyncio
import json
import os
from pathlib import Path
from datetime import timedelta
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parents[1]

async def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('tool', nargs='?', default='get_scene_info')
    parser.add_argument('--code-file')
    parser.add_argument('--code')
    parser.add_argument('--args', default='{}')
    parser.add_argument('--list', action='store_true')
    options = parser.parse_args()
    env = dict(os.environ, BLENDER_MCP_DISABLE_TELEMETRY='1', BLENDER_HOST='127.0.0.1')
    params = StdioServerParameters(command=str(ROOT / '.tools/blender-mcp-venv/bin/mcp-for-blender'), env=env)
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write, read_timeout_seconds=timedelta(seconds=900)) as session:
            info = await session.initialize()
            if options.list:
                result = await session.list_tools()
                print(json.dumps({'server': info.serverInfo.model_dump(), 'tools': [t.name for t in result.tools]}, indent=2))
                return
            args = json.loads(options.args)
            if options.code_file:
                args['code'] = Path(options.code_file).read_text()
            elif options.code:
                args['code'] = options.code
            result = await session.call_tool(options.tool, args)
            for block in result.content:
                if block.type == 'text':
                    print(block.text)
            if result.isError:
                raise SystemExit(1)

asyncio.run(run())
