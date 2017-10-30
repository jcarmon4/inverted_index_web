var express = require('express');
var router = express.Router();
var redis = require('redis');

var redisClient = redis.createClient("redis://h:padd1089bb3eef4b1bf8c5cd5019461d8f7ad76b4c6960640f882ce0f2a9c86a6@ec2-34-224-49-43.compute-1.amazonaws.com:65139");
redisClient.select(1);
//var redisClient = redis.createClient({host:'localhost', port: '6379', db: 7});

redisClient.on('ready',function() {
    console.log("Redis is ready");
});

redisClient.on('error',function() {
    console.log("Error in Redis");
});

router.get('/', function (req, res, next) {
    res.render('index');
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
    var wordsInQuery = [];
    words.forEach(function(word, i) {
        wordsInQuery.push("word:"+word);
    });

    var wordWithQuantityMap = new Map();
    words.forEach(function (word1) {
        var count = 0;
        words.forEach(function (word2) {
            if (word1 === word2){
                count += 1;
            }
        });
        wordWithQuantityMap.set(word1, count);
    });

    //TF is calculated for every unique word of the query
    var wordWithTfMap = new Map();
    words.forEach(function (word) {
        wordWithTfMap.set(word, wordWithQuantityMap.get(word) / words.length);
        console.log(word+" "+wordWithTfMap.get(word));
    });

    //TfIdf is calculated for every unique word of the query
    var wordWithIdfMap = new Map();
    var wordWithTfidfMap = new Map();
    words.forEach(function (word, i) {
        //Requesting word's idf by word
        getIDFbyDoc(word).then(function (idf) {
            wordWithIdfMap.set(word, idf);
            console.log("IDF");
            console.log(i+" word: "+word+" "+idf);
            wordWithTfidfMap.set(word, wordWithTfMap.get(word) * idf);

            if ((i+1) === words.length){
                console.log("TFIDF");
                console.dir(wordWithTfidfMap);
                var queryMagnitude = calculateQueryMagnitude(wordWithTfidfMap);
                console.log("Query magnitude "+queryMagnitude);

                var uniqueDocsSet = new Set();
                wordsInQuery.forEach(function (word, j) {
                    getDocsByWord(word).then(function(docs) {
                        docs.forEach(function (doc) {
                            uniqueDocsSet.add(doc);
                        });
                        if ((j+1) === wordsInQuery.length){
                            console.log("Unique Docs");
                            console.dir(uniqueDocsSet);

                            dotProduct(uniqueDocsSet, wordWithTfidfMap, queryMagnitude);
                        }
                    }).catch(function (error) {
                        console.log("Promise getDocsByWord Rejected");
                        console.error(error);
                    });
                });
            }
        }).catch(function () {
            console.log("Promise getIDFbyDoc Rejected");
        });
    });
});

function calculateQueryMagnitude(wordWithTfidfMap) {
    var sum = 0;
    wordWithTfidfMap.forEach(function(value, key) {
        sum += Math.pow(value, 2);
    });
    return Math.sqrt(sum);
}

function dotProduct(uniqueDocsSet, wordWithTfidfMap, queryMagnitude){
    var docNum = 0;
    var similarityByDoc = [];
    if (uniqueDocsSet.size > 0) {

        uniqueDocsSet.forEach(function (doc) {
            var resNum = 0;
            var dotProduct = 0;
            console.log("doc: " + doc);
            wordWithTfidfMap.forEach(function (tfidfQuery, wordQuery) {
                console.log("word_q:" + wordQuery + " tfidf_q:" + tfidfQuery);
                getTFIDFFromService(doc, wordQuery).then(function (tfidf) {
                    resNum += 1;
                    console.log("doc:" + doc + " word_q:" + wordQuery + " tfidf_q:" + tfidfQuery + " tfidf:" + tfidf);
                    dotProduct += (tfidfQuery * tfidf);

                    if (wordWithTfidfMap.size === resNum) {
                        console.log("dotProduct:" + dotProduct);
                        getMagnitudeFromService(doc).then(function (magnitude) {
                            docNum += 1;
                            console.log("magnitude " + doc + ": " + magnitude);
                            console.log("magnitude Q " + queryMagnitude);
                            console.log("dotProduct " + dotProduct);
                            var similarity = dotProduct / (magnitude * queryMagnitude);
                            console.log("doc " + doc + " similarity " + similarity);
                            similarityByDoc.push([doc, similarity]);

                            console.log("result_docs: " + uniqueDocsSet.size + " docNum: " + docNum)
                            if (uniqueDocsSet.size === docNum) {
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

var getTFIDFFromService = function (doc, queryWord) {
    return new Promise(function (resolve, reject) {
        var key = "tfidf:"+doc+";;"+queryWord;
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
