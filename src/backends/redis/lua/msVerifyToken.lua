local secretKey = KEYS[1];
local timeVerified = ARGV[1];
local erase = ARGV[2];

if redis.call('exists', secretKey) ~= 1 then
  return redis.error_reply("404");
end

-- mark as verified on the first run
local isFirstVerification = redis.call('hsetnx', secretKey, 'verified', timeVerified);
-- fetch data
local keys = redis.call('hgetall', secretKey);

-- decode related keys and update them
-- only run on first verification
if isFirstVerification == 1 or erase == 'true' then
  -- fetch related keys
  local related = cjson.decode(redis.call('hget', secretKey, 'related'));

  -- if we have erase, we don't need to write anything
  if erase == 'true' then
    redis.call('del', unpack(related));
  else
    -- otherwise we need to attach xtra data
    for i,key in ipairs(related) do
      if key ~= secretKey then
        redis.call('hset', key, 'verified', timeVerified);
      end
    end
  end

end

-- insert notion of whether thisis first verification or not
table.insert(keys, 'isFirstVerification');
table.insert(keys, isFirstVerification);

return keys;
