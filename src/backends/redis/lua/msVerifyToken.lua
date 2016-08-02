local secretKey = KEYS[1];
local timeVerified = ARGV[1];

if redis.call("exists", secretKey) ~= 1 then
  return redis.error_reply("404");
end

-- mark as verified on the first run
local isFirstVerification = redis.call('hsetnx', secretKey, 'verified', timeVerified);

-- fetch data
local keys = redis.call('hgetall', secretKey);

-- insert notion of whether thisis first verification or not
table.insert(keys, 'isFirstVerification');
table.insert(keys, isFirstVerification);

return keys;
