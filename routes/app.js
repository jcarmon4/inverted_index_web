var express = require('express');
var router = express.Router();
var redis = require('redis');

var redisClient = redis.createClient(process.env.REDIS_URL);
redisClient.select(1);

redisClient.on('ready',function() {
    console.log("Redis is ready");
});

redisClient.on('error',function() {
    console.log("Error in Redis");
});

router.get('/', function (req, res, next) {
    res.render('index');
});

var getIDFbyDoc = function (word) {
    return new Promise(function (resolve, reject) {
        redisClient.get("idf:"+word, function (err, value) {
            if (err) {
                reject(err);
            } else {
                if (value === null){
                    resolve(0);
                } else {
                    resolve(value);
                }
            }
        });
    });
};

var getDocsByWord = function(word) {
    return new Promise(function (resolve, reject) {
        var docs = [];
        redisClient.lrange(word, 0, -1, function (error, items) {
            if (error) {
                reject(error);
            } else {
                resolve(items);
            }
        });
    });
};

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
                    reject(err);
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

function getMagnitude(tfidf_by_word) {
    var sum = 0;
    tfidf_by_word.forEach(function(value, key) {
        sum += Math.pow(value, 2);
    });
    return Math.sqrt(sum);
}

router.get('/search/:q', function (req, res, next) {
    var query = req.params.q;
    var words = query.split("+");
    var words_to_search = [];
    words.forEach(function(word, i) {
        words_to_search.push("word:"+word);
    });
    var word_counts_to_search = words_to_search.length;

    var count_of_word_in_array = new Map();
    words.forEach(function (word_i) {
        var count = 0;
        words.forEach(function (word_j) {
            if (word_i === word_j){
                count += 1;
            }
        });
        count_of_word_in_array.set(word_i, count);
    });

    var tf_by_word = new Map();
    words.forEach(function (word) {
        tf_by_word.set(word, count_of_word_in_array.get(word) / words.length);
        console.log(word+" "+tf_by_word.get(word));
    });

    var idf_by_word = new Map();
    var tfidf_by_word = new Map();
    var num_response = 0;
    words.forEach(function (word, i) {
        getIDFbyDoc(word).then(function (idf) {
            num_response += 1;
            idf_by_word.set(word, idf);
            console.log("IDF");
            console.log("word: "+word+" "+idf)
            tfidf_by_word.set(word, tf_by_word.get(word) * idf);

            if (num_response === words.length){
                console.log("TFIDF");
                console.dir(tfidf_by_word);
                var magnitude = getMagnitude(tfidf_by_word);
                console.log("Magnitude "+magnitude);


                var result_counts = 0;
                var result_docs = new Set();
                words_to_search.forEach(function (word, i) {
                    getDocsByWord(word).then(function(docs) {
                        result_counts += 1;
                        docs.forEach(function (doc, i) {
                            result_docs.add(doc);
                        });
                        if (result_counts == word_counts_to_search){
                            console.log("Docs");
                            console.dir(result_docs);

                            dotProduct(result_docs, tfidf_by_word, magnitude);
                        }
                    }).catch(function (error) {
                        console.log("Promise Rejected getDocsByWord");
                        console.error(error);
                    });
                });
            }
        }).catch(function () {
            console.log("Promise Rejected");
        });
    });
});

function dotProduct(result_docs, tfidf_by_word, magnitude_q){
    var docNum = 0;
    var similarityByDoc = [];
    if (result_docs.size > 0) {

        result_docs.forEach(function (doc) {
            var resNum = 0;
            var dotProduct = 0;
            console.log("doc: " + doc);
            tfidf_by_word.forEach(function (tfidf_q, word_q) {
                console.log("word_q:" + word_q + " tfidf_q:" + tfidf_q);
                getTFIDFFromService(doc, word_q).then(function (tfidf) {
                    resNum += 1;
                    console.log("doc:" + doc + " word_q:" + word_q + " tfidf_q:" + tfidf_q + " tfidf:" + tfidf);
                    dotProduct += (tfidf_q * tfidf);

                    if (tfidf_by_word.size === resNum) {
                        console.log("dotProduct:" + dotProduct);
                        getMagnitudeFromService(doc).then(function (magnitude) {
                            docNum += 1;
                            console.log("magnitude " + doc + ": " + magnitude);
                            console.log("magnitude Q " + magnitude_q);
                            console.log("dotProduct " + dotProduct);
                            var similarity = dotProduct / (magnitude * magnitude_q);
                            console.log("doc " + doc + " similarity " + similarity);
                            similarityByDoc.push([doc, similarity]);

                            console.log("result_docs: " + result_docs.size + " docNum: " + docNum)
                            if (result_docs.size === docNum) {
                                console.log("Similarity sort");
                                similarityByDoc.sort(function (a, b) {
                                    return b[1] - a[1];
                                });
                                console.dir(similarityByDoc);
                                //Send to a function(similarityByDoc);
                            }
                        });
                    }
                }).catch(function (error) {
                    console.log("Promise Rejected getTFIDFFromService");
                    console.error(error);
                });
            });
        });
    } else {
        console.log("There aren't docs");
        // There are no docs to examine.
        //Send to a function(similarityByDoc);
    }
}



var getTFIDFFromService = function (doc, word_q) {
    return new Promise(function (resolve, reject) {
        var key = "tfidf:"+doc+";;"+word_q;
        console.log(key);
        redisClient.get(key, function (err, value) {
            if(err){
                reject(err);
            }
            if (value === null) {
                resolve(0);
            } else {
                resolve(value);
            }
        });
    });
};

var getMagnitudeFromService = function (doc) {
    return new Promise(function (resolve, reject) {
        var key = "magnitude:"+doc;
        redisClient.get(key, function (err, value) {
            if(err){
                reject(err);
            }
            if (value === null) {
                resolve(1);
            } else {
                resolve(value);
            }
        });
    });
};

module.exports = router;
