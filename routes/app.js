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
        var normWord = word.toLowerCase();
        console.log("normWord: "+normWord);
        if ((STOP_WORDS_ES.has(normWord) === false) && (STOP_WORDS_EN.has(normWord) === false)){
            wordsInQuery.push(normWord);
        }
    });

    var wordWithQuantityMap = new Map();
    wordsInQuery.forEach(function (word1) {
        var count = 0;
        wordsInQuery.forEach(function (word2) {
            if (word1 === word2){
                count += 1;
            }
        });
        wordWithQuantityMap.set(word1, count);
    });

    //TF is calculated for every unique word of the query
    var wordWithTfMap = new Map();
    wordsInQuery.forEach(function (word) {
        wordWithTfMap.set(word, wordWithQuantityMap.get(word) / wordsInQuery.length);
        console.log(word+" "+wordWithTfMap.get(word));
    });

    //TfIdf is calculated for every unique word of the query
    var wordWithIdfMap = new Map();
    var wordWithTfidfMap = new Map();
    wordsInQuery.forEach(function (word, i) {
        //Requesting word's idf by word
        getIDFbyDoc(word).then(function (idf) {
            wordWithIdfMap.set(word, idf);
            console.log("IDF");
            console.log(i+" word: "+word+" "+idf);
            wordWithTfidfMap.set(word, wordWithTfMap.get(word) * idf);

            if ((i+1) === wordsInQuery.length){
                console.log("TFIDF");
                console.dir(wordWithTfidfMap);
                var queryMagnitude = calculateQueryMagnitude(wordWithTfidfMap);
                console.log("Query magnitude "+queryMagnitude);

                var uniqueDocsSet = new Set();
                wordsInQuery.forEach(function (word, j) {
                    getDocsByWordFromService(word).then(function(docs) {
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
    var key = "idf:"+word;
    return new Promise(function (resolve, reject) {
        redisClient.get(key, function (err, value) {
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

var getDocsByWordFromService = function(word) {
    return new Promise(function (resolve, reject) {
        var key = "word:"+word;
        redisClient.lrange(key, 0, -1, function (error, items) {
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

var STOP_WORDS_ES = new Set(["a", "actualmente", "acuerdo", "adelante", "ademas", "además", "adrede", "afirmó", "agregó", "ahi",
    "ahora", "ahí", "al", "algo", "alguna", "algunas", "alguno", "algunos", "algún", "alli", "allí",
    "alrededor", "ambos", "ampleamos", "antano", "antaño", "ante", "anterior", "antes", "apenas",
    "aproximadamente", "aquel", "aquella", "aquellas", "aquello", "aquellos", "aqui", "aquél",
    "aquélla",
    "aquéllas", "aquéllos", "aquí", "arriba", "arribaabajo", "aseguró", "asi", "así", "atras", "aun",
    "aunque", "ayer", "añadió", "aún", "b", "bajo", "bastante", "bien", "breve", "buen", "buena",
    "buenas", "bueno", "buenos", "c", "cada", "casi", "cerca", "cierta", "ciertas", "cierto",
    "ciertos",
    "cinco", "claro", "comentó", "como", "con", "conmigo", "conocer", "conseguimos", "conseguir",
    "considera", "consideró", "consigo", "consigue", "consiguen", "consigues", "contigo", "contra",
    "cosas", "creo", "cual", "cuales", "cualquier", "cuando", "cuanta", "cuantas", "cuanto", "cuantos",
    "cuatro", "cuenta", "cuál", "cuáles", "cuándo", "cuánta", "cuántas", "cuánto", "cuántos", "cómo",
    "d",
    "da", "dado", "dan", "dar", "de", "debajo", "debe", "deben", "debido", "decir", "dejó", "del",
    "delante", "demasiado", "demás", "dentro", "deprisa", "desde", "despacio", "despues", "después",
    "detras", "detrás", "dia", "dias", "dice", "dicen", "dicho", "dieron", "diferente", "diferentes",
    "dijeron", "dijo", "dio", "donde", "dos", "durante", "día", "días", "dónde", "e", "ejemplo", "el",
    "ella", "ellas", "ello", "ellos", "embargo", "empleais", "emplean", "emplear", "empleas", "empleo",
    "en", "encima", "encuentra", "enfrente", "enseguida", "entonces", "entre", "era", "eramos", "eran",
    "eras", "eres", "es", "esa", "esas", "ese", "eso", "esos", "esta", "estaba", "estaban", "estado",
    "estados", "estais", "estamos", "estan", "estar", "estará", "estas", "este", "esto", "estos",
    "estoy",
    "estuvo", "está", "están", "ex", "excepto", "existe", "existen", "explicó", "expresó", "f", "fin",
    "final", "fue", "fuera", "fueron", "fui", "fuimos", "g", "general", "gran", "grandes", "gueno",
    "h",
    "ha", "haber", "habia", "habla", "hablan", "habrá", "había", "habían", "hace", "haceis", "hacemos",
    "hacen", "hacer", "hacerlo", "haces", "hacia", "haciendo", "hago", "han", "hasta", "hay", "haya",
    "he", "hecho", "hemos", "hicieron", "hizo", "horas", "hoy", "hubo", "i", "igual", "incluso",
    "indicó",
    "informo", "informó", "intenta", "intentais", "intentamos", "intentan", "intentar", "intentas",
    "intento", "ir", "j", "junto", "k", "l", "la", "lado", "largo", "las", "le", "lejos", "les",
    "llegó",
    "lleva", "llevar", "lo", "los", "luego", "lugar", "m", "mal", "manera", "manifestó", "mas",
    "mayor",
    "me", "mediante", "medio", "mejor", "mencionó", "menos", "menudo", "mi", "mia", "mias", "mientras",
    "mio", "mios", "mis", "misma", "mismas", "mismo", "mismos", "modo", "momento", "mucha", "muchas",
    "mucho", "muchos", "muy", "más", "mí", "mía", "mías", "mío", "míos", "n", "nada", "nadie", "ni",
    "ninguna", "ningunas", "ninguno", "ningunos", "ningún", "no", "nos", "nosotras", "nosotros",
    "nuestra", "nuestras", "nuestro", "nuestros", "nueva", "nuevas", "nuevo", "nuevos", "nunca", "o",
    "ocho", "os", "otra", "otras", "otro", "otros", "p", "pais", "para", "parece", "parte", "partir",
    "pasada", "pasado", "paìs", "peor", "pero", "pesar", "poca", "pocas", "poco", "pocos", "podeis",
    "podemos", "poder", "podria", "podriais", "podriamos", "podrian", "podrias", "podrá", "podrán",
    "podría", "podrían", "poner", "por", "porque", "posible", "primer", "primera", "primero",
    "primeros",
    "principalmente", "pronto", "propia", "propias", "propio", "propios", "proximo", "próximo",
    "próximos", "pudo", "pueda", "puede", "pueden", "puedo", "pues", "q", "qeu", "que", "quedó",
    "queremos", "quien", "quienes", "quiere", "quiza", "quizas", "quizá", "quizás", "quién", "quiénes",
    "qué", "r", "raras", "realizado", "realizar", "realizó", "repente", "respecto", "s", "sabe",
    "sabeis",
    "sabemos", "saben", "saber", "sabes", "salvo", "se", "sea", "sean", "segun", "segunda", "segundo",
    "según", "seis", "ser", "sera", "será", "serán", "sería", "señaló", "si", "sido", "siempre",
    "siendo",
    "siete", "sigue", "siguiente", "sin", "sino", "sobre", "sois", "sola", "solamente", "solas",
    "solo",
    "solos", "somos", "son", "soy", "soyos", "su", "supuesto", "sus", "suya", "suyas", "suyo", "sé",
    "sí",
    "sólo", "t", "tal", "tambien", "también", "tampoco", "tan", "tanto", "tarde", "te", "temprano",
    "tendrá", "tendrán", "teneis", "tenemos", "tener", "tenga", "tengo", "tenido", "tenía", "tercera",
    "ti", "tiempo", "tiene", "tienen", "toda", "todas", "todavia", "todavía", "todo", "todos", "total",
    "trabaja", "trabajais", "trabajamos", "trabajan", "trabajar", "trabajas", "trabajo", "tras",
    "trata",
    "través", "tres", "tu", "tus", "tuvo", "tuya", "tuyas", "tuyo", "tuyos", "tú", "u", "ultimo", "un",
    "una", "unas", "uno", "unos", "usa", "usais", "usamos", "usan", "usar", "usas", "uso", "usted",
    "ustedes", "v", "va", "vais", "valor", "vamos", "van", "varias", "varios", "vaya", "veces", "ver",
    "verdad", "verdadera", "verdadero", "vez", "vosotras", "vosotros", "voy", "vuestra", "vuestras",
    "vuestro", "vuestros", "w", "x", "y", "ya", "yo", "z", "él", "ésa", "ésas", "ése", "ésos", "ésta",
    "éstas", "éste", "éstos", "última", "últimas", "último", "últimos"]);
var STOP_WORDS_EN = new Set(["a", "a's", "able", "about", "above", "according", "accordingly", "across", "actually", "after",
    "afterwards", "again", "against", "ain't", "all", "allow", "allows", "almost", "alone", "along",
    "already", "also", "although", "always", "am", "among", "amongst", "an", "and", "another", "any",
    "anybody", "anyhow", "anyone", "anything", "anyway", "anyways", "anywhere", "apart", "appear",
    "appreciate", "appropriate", "are", "aren't", "around", "as", "aside", "ask", "asking",
    "associated", "at", "available", "away", "awfully", "b", "be", "became", "because", "become",
    "becomes", "becoming", "been", "before", "beforehand", "behind", "being", "believe", "below",
    "beside", "besides", "best", "better", "between", "beyond", "both", "brief", "but", "by", "c",
    "c'mon", "c's", "came", "can", "can't", "cannot", "cant", "cause", "causes", "certain",
    "certainly", "changes", "clearly", "co", "com", "come", "comes", "concerning", "consequently",
    "consider", "considering", "contain", "containing", "contains", "corresponding", "could",
    "couldn't", "course", "currently", "d", "definitely", "described", "despite", "did", "didn't",
    "different", "do", "does", "doesn't", "doing", "don't", "done", "down", "downwards", "during", "e",
    "each", "edu", "eg", "eight", "either", "else", "elsewhere", "enough", "entirely", "especially",
    "et", "etc", "even", "ever", "every", "everybody", "everyone", "everything", "everywhere", "ex",
    "exactly", "example", "except", "f", "far", "few", "fifth", "first", "five", "followed",
    "following", "follows", "for", "former", "formerly", "forth", "four", "from", "further",
    "furthermore", "g", "get", "gets", "getting", "given", "gives", "go", "goes", "going", "gone",
    "got", "gotten", "greetings", "h", "had", "hadn't", "happens", "hardly", "has", "hasn't", "have",
    "haven't", "having", "he", "he's", "hello", "help", "hence", "her", "here", "here's", "hereafter",
    "hereby", "herein", "hereupon", "hers", "herself", "hi", "him", "himself", "his", "hither",
    "hopefully", "how", "howbeit", "however", "i", "i'd", "i'll", "i'm", "i've", "ie", "if", "ignored",
    "immediate", "in", "inasmuch", "inc", "indeed", "indicate", "indicated", "indicates", "inner",
    "insofar", "instead", "into", "inward", "is", "isn't", "it", "it'd", "it'll", "it's", "its",
    "itself", "j", "just", "k", "keep", "keeps", "kept", "know", "known", "knows", "l", "last",
    "lately", "later", "latter", "latterly", "least", "less", "lest", "let", "let's", "like", "liked",
    "likely", "little", "look", "looking", "looks", "ltd", "m", "mainly", "many", "may", "maybe", "me",
    "mean", "meanwhile", "merely", "might", "more", "moreover", "most", "mostly", "much", "must", "my",
    "myself", "n", "name", "namely", "nd", "near", "nearly", "necessary", "need", "needs", "neither",
    "never", "nevertheless", "new", "next", "nine", "no", "nobody", "non", "none", "noone", "nor",
    "normally", "not", "nothing", "novel", "now", "nowhere", "o", "obviously", "of", "off", "often",
    "oh", "ok", "okay", "old", "on", "once", "one", "ones", "only", "onto", "or", "other", "others",
    "otherwise", "ought", "our", "ours", "ourselves", "out", "outside", "over", "overall", "own", "p",
    "particular", "particularly", "per", "perhaps", "placed", "please", "plus", "possible",
    "presumably", "probably", "provides", "q", "que", "quite", "qv", "r", "rather", "rd", "re",
    "really", "reasonably", "regarding", "regardless", "regards", "relatively", "respectively",
    "right", "s", "said", "same", "saw", "say", "saying", "says", "second", "secondly", "see",
    "seeing", "seem", "seemed", "seeming", "seems", "seen", "self", "selves", "sensible", "sent",
    "serious", "seriously", "seven", "several", "shall", "she", "should", "shouldn't", "since", "six",
    "so", "some", "somebody", "somehow", "someone", "something", "sometime", "sometimes", "somewhat",
    "somewhere", "soon", "sorry", "specified", "specify", "specifying", "still", "sub", "such", "sup",
    "sure", "t", "t's", "take", "taken", "tell", "tends", "th", "than", "thank", "thanks", "thanx",
    "that", "that's", "thats", "the", "their", "theirs", "them", "themselves", "then", "thence",
    "there", "there's", "thereafter", "thereby", "therefore", "therein", "theres", "thereupon",
    "these", "they", "they'd", "they'll", "they're", "they've", "think", "third", "this", "thorough",
    "thoroughly", "those", "though", "three", "through", "throughout", "thru", "thus", "to",
    "together", "too", "took", "toward", "towards", "tried", "tries", "truly", "try", "trying",
    "twice", "two", "u", "un", "under", "unfortunately", "unless", "unlikely", "until", "unto", "up",
    "upon", "us", "use", "used", "useful", "uses", "using", "usually", "uucp", "v", "value", "various",
    "very", "via", "viz", "vs", "w", "want", "wants", "was", "wasn't", "way", "we", "we'd", "we'll",
    "we're", "we've", "welcome", "well", "went", "were", "weren't", "what", "what's", "whatever",
    "when", "whence", "whenever", "where", "where's", "whereafter", "whereas", "whereby", "wherein",
    "whereupon", "wherever", "whether", "which", "while", "whither", "who", "who's", "whoever",
    "whole", "whom", "whose", "why", "will", "willing", "wish", "with", "within", "without", "won't",
    "wonder", "would", "wouldn't", "x", "y", "yes", "yet", "you", "you'd", "you'll", "you're",
    "you've", "your", "yours", "yourself", "yourselves", "z", "zero"]);