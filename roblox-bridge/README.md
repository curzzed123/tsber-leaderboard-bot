# Codely CLI ↔ Roblox Studio Bridge

A bridge that lets Codely CLI control Roblox Studio — create parts, run code, build models, and more.

## How it works

```
Codely CLI → HTTP → [Python Server :8080] ← Polling ← [Roblox Plugin in Studio]
```

## Files

| File | Description |
|------|-------------|
| `server.py` | Local HTTP middleware server (run this first) |
| `plugin.lua` | Roblox Studio plugin script |

## Setup

### Step 1: Start the Python server

Open a terminal and run:

```bash
cd C:\Users\ziyad\.codely\Default\roblox-bridge
python server.py
```

You should see:

```
Roblox Studio Bridge running on http://127.0.0.1:8080
Waiting for connections...
```

Keep this terminal open.

### Step 2: Install the plugin in Roblox Studio

1. Open Roblox Studio
2. Go to the **Plugins** tab → **Plugin Manager** → **Create New Plugin**
   - OR: Open the Lua script editor and create a new script
3. Name it `CodelyBridge`
4. Paste the entire contents of `plugin.lua` into the script
5. Save and close the script editor
6. You should see a **"Codely Bridge"** button appear in the toolbar

### Step 3: Connect

1. Click the **Codely Bridge** toolbar button in Studio
2. The button will highlight (turn active)
3. The Output window should print: `[Codely Bridge] Connected! Polling for commands...`

### Step 4: Send commands

Codely CLI can now send commands via the server. Test it from another terminal:

```bash
curl -X POST http://127.0.0.1:8080/command -H "Content-Type: application/json" -d "{\"action\": \"create_part\", \"params\": {\"name\": \"TestPart\", \"size\": [4, 1, 2], \"color\": [255, 0, 0]}}"
```

A red part should appear in the Studio workspace!

## Available Commands

### `create_part`
```json
{
  "action": "create_part",
  "params": {
    "name": "MyPart",
    "size": [4, 1, 2],
    "position": [0, 5, 0],
    "color": [255, 0, 0],
    "material": "Neon",
    "transparency": 0.5,
    "anchored": true,
    "parent": "Workspace"
  }
}
```

### `delete_instance`
```json
{
  "action": "delete_instance",
  "params": { "path": "Workspace.MyPart" }
}
```

### `set_property`
```json
{
  "action": "set_property",
  "params": {
    "path": "Workspace.MyPart",
    "property": "Transparency",
    "value": 0.5,
    "value_type": "number"
  }
}
```

### `get_property`
```json
{
  "action": "get_property",
  "params": {
    "path": "Workspace.MyPart",
    "property": "Name"
  }
}
```

### `create_model`
```json
{
  "action": "create_model",
  "params": {
    "name": "MyModel",
    "parent": "Workspace"
  }
}
```

### `create_folder`
```json
{
  "action": "create_folder",
  "params": {
    "name": "MyFolder",
    "parent": "Workspace"
  }
}
```

### `move_instance`
```json
{
  "action": "move_instance",
  "params": {
    "path": "Workspace.MyPart",
    "new_parent": "Workspace.MyModel"
  }
}
```

### `duplicate_instance`
```json
{
  "action": "duplicate_instance",
  "params": {
    "path": "Workspace.MyPart",
    "name": "MyPartCopy"
  }
}
```

### `group_parts`
```json
{
  "action": "group_parts",
  "params": {
    "name": "GroupedModel",
    "paths": ["Workspace.Part1", "Workspace.Part2"]
  }
}
```

### `get_children`
```json
{
  "action": "get_children",
  "params": { "path": "Workspace" }
}
```

### `clear_workspace`
```json
{
  "action": "clear_workspace",
  "params": {}
}
```
⚠️ Destructive — deletes all parts, models, and folders from Workspace.

### `create_script`
```json
{
  "action": "create_script",
  "params": {
    "script_type": "Script",
    "name": "MyScript",
    "parent": "ServerScriptService",
    "source": "print('Hello from Codely!')"
  }
}
```

### `run_code`
```json
{
  "action": "run_code",
  "params": {
    "code": "local p = Instance.new('Part') p.Size = Vector3.new(2, 2, 2) p.Position = Vector3.new(0, 10, 0) p.Color = Color3.fromRGB(0, 255, 0) p.Anchored = true p.Parent = workspace return p.Name"
  }
}
```
Most powerful command — runs arbitrary Luau code with full access to the Studio API.

## Troubleshooting

**Plugin doesn't appear in toolbar:**
- Make sure you saved the plugin script properly
- Try restarting Roblox Studio

**Plugin can't connect to server:**
- Make sure `server.py` is running
- Check the server is on port 8080
- Ensure no firewall is blocking localhost connections

**HTTP requests fail:**
- In Studio: Game Settings → Security → Enable "Allow HTTP Requests"
- Note: Studio plugins generally bypass this setting, but enable it just in case

**Commands not executing:**
- Check the Output window in Studio for error messages
- Make sure the Codely Bridge button is active (highlighted)

## Architecture

```
┌─────────────┐     HTTP POST      ┌─────────────────┐     GET /poll      ┌──────────────────┐
│  Codely CLI  │ ─────────────────→ │  Python Server  │ ←───────────────── │  Roblox Plugin   │
│             │   POST /command    │  (localhost:8080)│   POST /result     │  (in Studio)     │
│             │ ←───────────────── │                  │ ─────────────────→ │                  │
│             │   GET /results     │                  │                    │                  │
└─────────────┘                    └─────────────────┘                    └──────────────────┘
```
