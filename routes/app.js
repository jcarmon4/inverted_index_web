var express = require('express');
var router = express.Router();
var redis = require('redis');

var redisClient = redis.createClient({host : 'localhost', port : 6379, db : 0});

redisClient.on('ready',function() {
    console.log("Redis is ready");
});

redisClient.on('error',function() {
    console.log("Error in Redis");
});


router.get('/', function (req, res, next) {
    res.render('index');
});

router.get('/redis', function (req, res, next) {
    // redisClient.set("string key", "over string val", redis.print);
    //
    // redisClient.hset("hash key", "hashtest 1", "some value", redis.print);
    // redisClient.hset(["hash key", "hashtest 2", "some other value"], redis.print);

    var keys = [];
    var hashs = [];

    redisClient.keys("*", function (err, replies) {
        replies.forEach(function (reply, i) {
            keys.push(reply);
            console.log("item " + i + ": " + reply);
        });
    });

    redisClient.hkeys("hash key", function (err, replies) {
        console.log(replies.length + " replies:");
        replies.forEach(function (reply, i) {
            hashs.push(reply);
            console.log("    " + i + ": " + reply);
        });
    });

    redisClient.quit();

    res.render('index');
});

module.exports = router;
