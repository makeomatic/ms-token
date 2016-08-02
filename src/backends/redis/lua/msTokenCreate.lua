-- we have a set of 4 keys, which operate on each other
local idKey = KEYS[1];
local uidKey = KEYS[2];
local secretKey = KEYS[3];
local throttleKey = KEYS[4];

-- id & action
local id = ARGV[1];
local action = ARGV[2];

-- optional, acts as alias to idKey if present
local uid = ARGV[3];

-- optional, remove entry after ttl
local ttl = tonumber(ARGV[4]) or 0;

-- optional, do not allow #create action on #idKey more than once in #throttle
local throttle = tonumber(ARGV[5]) or 0;

-- optional, can be used to retrieve associated information
-- defaults to #idKey
local secret = ARGV[6];

-- metadata associated with the challenge
-- encoded JSON, contains multi-field stringified JSON
local _metadata = cjson.decode(ARGV[7]);
local metadata = {};
local tinsert = table.insert;

-- convert metadata to plain table
for fieldName, filterValue in pairs(_metadata) do
  tinsert(metadata, fieldName);
  tinsert(metadata, filterValue);
end

-- helper for empty vals
local function isempty(s)
  return s == false or s == nil or s == '';
end

-- we check if value exists before attempting to capture lock
-- because script execution is atomic, we do not need to make sure that we've captured the lock
if isempty(redis.call("GET", throttleKey)) ~= true then
  return redis.error_reply("429");
end

-- make sure that we own the "lock"
if throttle > 0 then
  redis.call("SET", throttleKey, "1", "EX", throttle, "NX");
end

local function insertToken(key)
  redis.call("HMSET", key, "id", id, "action", action, "uid", uid, "secret", secret, unpack(metadata));
  if ttl > 0 then
    redis.call("EXPIRE", key, ttl);
  end
end

-- insert basic data
insertToken(idKey);

-- insert secret -> action/id access pattern
if secretKey ~= idKey then
  insertToken(secretKey);
end

-- insert uid -> action/id access pattern
if uidKey ~= idKey then
  insertToken(uidKey);
end

return redis.status_reply("200");
