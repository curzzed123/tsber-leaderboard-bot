--[[
	Codely CLI Bridge Plugin for Roblox Studio
	------------------------------------------
	Install: Place this script in a Plugin (Plugins tab > Plugin Manager > Create New Plugin)
	Or: Save as .lua file in %AppData%/Roaming/RoBot/Plugins/ (local plugin folder)

	This plugin polls a local server for commands from Codely CLI
	and executes them inside Roblox Studio.
]]

local HttpService = game:GetService("HttpService")
local Workspace = game:GetService("Workspace")
local RunService = game:GetService("RunService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")

local SERVER_URL = "http://127.0.0.1:8080"
local POLL_INTERVAL = 1 -- seconds between polls

local toolbar = plugin:CreateToolbar("Codely Bridge")
local toggleButton = toolbar:CreateButton(
	"CodelyBridgeToggle",
	"Codely Bridge",
	"Toggle connection to Codely CLI"
)
toggleButton:SetActive(false)

local active = false
local pollConnection = nil

--==================================================
-- Result reporting
--==================================================

local function sendResult(commandId, status, message, data)
	local payload = HttpService:JSONEncode({
		command_id = commandId,
		status = status,
		message = message or "",
		data = data or {},
	})
	pcall(function()
		HttpService:PostAsync(
			SERVER_URL .. "/result",
			payload,
			Enum.ContentType.ApplicationJson
		)
	end)
end

--==================================================
-- Utility: resolve an instance by path (e.g. "Workspace.MyPart")
--==================================================

local function resolveInstance(path)
	local obj = game
	for segment in string.gmatch(path, "[^.]+") do
		if segment == "game" then
			obj = game
		elseif obj then
			obj = obj:FindFirstChild(segment)
		end
	end
	return obj
end

--==================================================
-- Utility: parse Vector3 from table {x, y, z}
--==================================================

local function toVector3(t)
	if type(t) == "table" then
		return Vector3.new(t[1] or t.x or 0, t[2] or t.y or 0, t[3] or t.z or 0)
	end
	return Vector3.new(0, 0, 0)
end

local function toColor3(t)
	if type(t) == "table" then
		if t.r then
			return Color3.fromRGB(t[1] or 255, t[2] or 255, t[3] or 255)
		end
		return Color3.fromRGB(t[1] or 255, t[2] or 255, t[3] or 255)
	end
	return Color3.fromRGB(255, 255, 255)
end

--==================================================
-- Command Handlers
--==================================================

local handlers = {}

-- Create a basic Part
function handlers.create_part(params)
	local part = Instance.new("Part")
	if params.size then
		part.Size = toVector3(params.size)
	else
		part.Size = Vector3.new(4, 1, 2)
	end
	if params.position then
		part.Position = toVector3(params.position)
	else
		part.Position = Vector3.new(0, 5, 0)
	end
	part.Anchored = params.anchored ~= false -- default true
	if params.color then
		part.Color = toColor3(params.color)
	end
	if params.material then
		pcall(function()
			part.Material = Enum.Material[params.material]
		end)
	end
	if params.transparency then
		part.Transparency = params.transparency
	end
	if params.name then
		part.Name = params.name
	end
	if params.parent then
		local parent = resolveInstance(params.parent)
		if parent then
			part.Parent = parent
		else
			part.Parent = Workspace
		end
	else
		part.Parent = Workspace
	end
	return part
end

-- Delete an instance by path
function handlers.delete_instance(params)
	local target = resolveInstance(params.path)
	if not target then
		error("Instance not found: " .. params.path)
	end
	target:Destroy()
end

-- Set a property on an instance
function handlers.set_property(params)
	local target = resolveInstance(params.path)
	if not target then
		error("Instance not found: " .. params.path)
	end
	-- Try to parse the value as a known type
	local value = params.value
	if params.value_type == "Vector3" then
		value = toVector3(params.value)
	elseif params.value_type == "Color3" then
		value = toColor3(params.value)
	elseif params.value_type == "boolean" then
		value = params.value == true or params.value == "true"
	elseif params.value_type == "number" then
		value = tonumber(params.value)
	end
	target[params.property] = value
end

-- Get a property value from an instance
function handlers.get_property(params)
	local target = resolveInstance(params.path)
	if not target then
		error("Instance not found: " .. params.path)
	end
	local value = target[params.property]
	return value
end

-- Create a Model (optionally group existing parts)
function handlers.create_model(params)
	local model = Instance.new("Model")
	if params.name then
		model.Name = params.name
	end
	local parent = params.parent and resolveInstance(params.parent) or Workspace
	model.Parent = parent
	return model
end

-- Group parts into a model
function handlers.group_parts(params)
	local model = Instance.new("Model")
	if params.name then
		model.Name = params.name
	end
	model.Parent = Workspace
	for _, partPath in ipairs(params.paths or {}) do
		local part = resolveInstance(partPath)
		if part then
			part.Parent = model
		end
	end
	return model
end

-- Create a Folder
function handlers.create_folder(params)
	local folder = Instance.new("Folder")
	if params.name then
		folder.Name = params.name
	end
	local parent = params.parent and resolveInstance(params.parent) or Workspace
	folder.Parent = parent
	return folder
end

-- Clear all parts from Workspace (destructive!)
function handlers.clear_workspace(params)
	for _, child in ipairs(Workspace:GetChildren()) do
		if child:IsA("BasePart") or child:IsA("Model") or child:IsA("Folder") then
			child:Destroy()
		end
	end
end

-- Move an instance to a new parent
function handlers.move_instance(params)
	local target = resolveInstance(params.path)
	if not target then
		error("Instance not found: " .. params.path)
	end
	local newParent = resolveInstance(params.new_parent)
	if not newParent then
		error("Parent not found: " .. params.new_parent)
	end
	target.Parent = newParent
end

-- Duplicate an instance
function handlers.duplicate_instance(params)
	local target = resolveInstance(params.path)
	if not target then
		error("Instance not found: " .. params.path)
	end
	local clone = target:Clone()
	if params.name then
		clone.Name = params.name
	end
	local parent = params.parent and resolveInstance(params.parent) or target.Parent
	clone.Parent = parent
	return clone
end

-- Run arbitrary Luau code (most powerful command)
-- Code has access to: game, workspace, Instance, Vector3, CFrame, Color3, Enum, etc.
function handlers.run_code(params)
	local code = params.code
	if not code then
		error("No code provided")
	end
	local fn, err = loadstring(code)
	if not fn then
		error("Syntax error: " .. err)
	end
	local results = table.pack(fn())
	-- Convert results to a simple format for JSON
	local output = {}
	for i = 1, results.n do
		local v = results[i]
		if type(v) == "string" or type(v) == "number" or type(v) == "boolean" then
			table.insert(output, tostring(v))
		else
			table.insert(output, tostring(v))
		end
	end
	return output
end

-- Get children of an instance
function handlers.get_children(params)
	local target = resolveInstance(params.path or "Workspace")
	if not target then
		error("Instance not found: " .. (params.path or "Workspace"))
	end
	local children = {}
	for _, child in ipairs(target:GetChildren()) do
		table.insert(children, {
			name = child.Name,
			className = child.ClassName,
			path = params.path and (params.path .. "." .. child.Name) or child.Name,
		})
	end
	return children
end

-- Create a script inside an instance
function handlers.create_script(params)
	local scriptType = params.script_type or "Script" -- "Script" or "LocalScript" or "ModuleScript"
	local script = Instance.new(scriptType)
	if params.name then
		script.Name = params.name
	end
	if params.source then
		script.Source = params.source
	end
	local parent = params.parent and resolveInstance(params.parent) or Workspace
	script.Parent = parent
	return script
end

--==================================================
-- Command execution
--==================================================

local function executeCommand(command)
	local action = command.action
	local params = command.params or {}
	local handler = handlers[action]

	if not handler then
		sendResult(command.id, "error", "Unknown action: " .. tostring(action))
		return
	end

	-- Wrap in ChangeHistory so undo works
	ChangeHistoryService:TryBeginRecording("CodelyBridge_" .. action)

	local ok, result = pcall(handler, params)

	if ok then
		local responseData = {}
		if result then
			if type(result) == "table" then
				responseData = result
			else
				responseData.value = tostring(result)
			end
		end
		-- If the result is an Instance, include its path
		if typeof(result) == "Instance" then
			responseData.instance = {
				name = result.Name,
				className = result.ClassName,
				path = result:GetFullName(),
			}
		end
		sendResult(command.id, "ok", "Success", responseData)
	else
		sendResult(command.id, "error", tostring(result))
	end

	ChangeHistoryService:FinishRecording()
end

--==================================================
-- Polling loop
--==================================================

local function poll()
	pcall(function()
		local response = HttpService:GetAsync(SERVER_URL .. "/poll")
		local data = HttpService:JSONDecode(response)
		if data.command then
			executeCommand(data.command)
		end
	end)
end

local lastPollTime = 0

local function startPolling()
	if pollConnection then
		pollConnection:Disconnect()
	end
	pollConnection = RunService.Heartbeat:Connect(function()
		-- Throttle to POLL_INTERVAL
		local now = os.clock()
		if now - lastPollTime >= POLL_INTERVAL then
			lastPollTime = now
			poll()
		end
	end)
end

local function stopPolling()
	if pollConnection then
		pollConnection:Disconnect()
		pollConnection = nil
	end
end

--==================================================
-- Toolbar toggle
--==================================================

toggleButton.Click:Connect(function()
	active = not active
	toggleButton:SetActive(active)
	if active then
		print("[Codely Bridge] Connected! Polling for commands...")
		startPolling()
	else
		print("[Codely Bridge] Disconnected.")
		stopPolling()
	end
end)

print("[Codely Bridge] Plugin loaded. Click the toolbar button to connect.")
