-- we have a set of 4 keys, which operate on each other
local idKey = KEYS[1];
local uidKey = KEYS[2];
local secretKey = KEYS[3];
local newSecretKey = KEYS[4];

-- args
local secret = ARGV[1];
local newSecret = ARGV[2];

-- check that we still operate on the same secret
local currentSecret = redis.call("hget", idKey, "secret");
if tostring(currentSecret) ~= secret then
  return redis.error_reply("409");
end

local function updateSecret(key)
  redis.call("hmset", key, "secret", newSecret);
end

-- rename old secret to new one
redis.call("rename", secretKey, newSecretKey);

-- insert new secret values
updateSecret(idKey);
updateSecret(uidKey);
updateSecret(newSecretKey);

return redis.status_reply("200");
