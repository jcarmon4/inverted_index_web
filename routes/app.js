var express = require('express');
var router = express.Router();
var redis = require('redis');

var redisClient = redis.createClient({host : 'localhost', port : 6379, db : 7});

redisClient.on('ready',function() {
    console.log("Redis is ready");
});

redisClient.on('error',function() {
    console.log("Error in Redis");
});

router.get('/', function (req, res, next) {
    res.render('index');
});

var getDocsByWord = function(word) {
    return new Promise(function (resolve, reject) {
        var docs = [];
        redisClient.lrange(word, 0, -1, function (error, items) {
            if (error) {
                console.log("Error");
                reject(error);
            } else {
                resolve(items);
            }
        });
    });
}

getKeysPromise = new Promise(function (resolve, reject) {
    var keys = [];
    var rows = [];
    redisClient.keys("*", function (err, replies) {
        if(err){
            return reject(err);
        }
        replies.forEach(function (key, i) {
            redisClient.get(key, function (err, value) {
                if(err){
                    return reject(err);
                }
                if(value){
                    var row = {key: key, value: value};
                    rows.push(row);
                }
            });
            keys.push(key);
            //console.log("item " + i + ": " + reply);
            console.log(rows.length);
            resolve(rows);
        });
    });
});

router.get('/keyspro', function (req, res, next) {
    getKeysPromise.then(function (keys) {
        keys.forEach(function (key, i) {
            console.log(key);
        });
    }, console.err);
});

router.get('/search/:q', function (req, res, next) {
    var query = req.params.q;
    var words = query.split("+");
    var words_to_search = [];
    words.forEach(function(word, i) {
        words_to_search.push("word:"+word);
    });
    var word_counts_to_search = words_to_search.length;
    var result_counts = 0;
    var result_docs = new Set();
    words_to_search.forEach(function (word, i) {
        //Validate that the word exist
        redisClient.exists(word, function (err, reply) {
            if (!err) {
                if (reply === 1) {
                    console.log("Key exists");
                    getDocsByWord(word).then(function(docs) {
                        result_counts += 1;
                        docs.forEach(function (doc, i) {
                            result_docs.add(doc);
                        });
                        if (result_counts == word_counts_to_search){
                            console.log("Results");
                            console.dir(result_docs);
                        }
                    }, console.err);
                } else {
                    word_counts_to_search -= 1;
                    console.log("Does't exists");
                }
            }
        });
    });
});

module.exports = router;
