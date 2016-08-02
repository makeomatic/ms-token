-- we have a set of 4 keys, which operate on each other
local idKey = KEYS[1];
-- other keys must be supplied by app as well

-- args
local secret = ARGV[1];

-- check that we still operate on the same secret
local currentSecret = redis.call("hget", idKey, "secret");
if tostring(currentSecret) ~= secret then
  return redis.error_reply("409");
end

-- cleanup
redis.call("del", unpack(KEYS));

return redis.status_reply("200");
