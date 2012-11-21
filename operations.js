var send = require(CONFIG.root + "/core/send.js").send;

var mongo = require("mongodb");
var Server = mongo.Server;
var Db = mongo.Db;

var dataSources = {
    cartDS: {
        type: "mongo",
        db: "truckshop",
        collection: "cart"
    }
}

var databases = {};

exports.create = function(link) {

    if (!link.session) {
        send.badrequest(link, "Only applications using sessions can use a 'server' cart");
        return;
    }

    var data = link.data;

    if (!data) {
        send.badrequest(link, { status: "missing data" });
        return;
    }

    getCollection(link, function(err, collection) {

        if (err) {
            send.badrequest(link, err);
            return;
        }

        getCart(collection, link, function(err, cart) {

            if (err) {
                send.badrequest(link, err);
                return;
            }

            data.quantity = data.quantity || 1;

            var items = cart.items;
            if (items[data._id]) {
                data.quantity = items[data._id].quantity + data.quantity;
            }

            var set = {};
            set["items." + data._id] = data;

            collection.update({ _id: cart._id }, { $set: set }, { safe: true }, function(err, results) {

                if (err) {
                    send.badrequest(link, err);
                    return;
                }

                if (results != 1) {
                    return console.error("Could not add item to the cart.");
                }

                send.ok(link.res, data);
            });
        });
    });
};

function getCart(collection, link, callback) {

    collection.findOne({ _id: link.session.id }, function(err, cart) {

        if (err) {
            send.badrequest(link, err);
            return;
        }

        if (cart) {
            return callback(null, cart);
        }

        // we must create a new cart
        collection.insert({ _id: link.session.id, items: {} }, function(err, results) {
debugger;

            if (err) { return callback(err); }

            if (!results.length) { return callback("Could not create new cart."); }

            callback(null, results[0]);
        });
    });

}

exports.read = function(link) {

    if (!link.session) {
        send.badrequest(link, "Only applications using sessions can use a 'server' cart");
        return;
    }

    getCollection(link, function(err, collection) {

        if (err) {
            send.badrequest(link, err);
            return;
        }

        var data = link.data || {};

        collection.findOne({ _id: link.session.id }, function(err, cart) {

            if (err) {
                send.badrequest(link, err);
                return;
            }

            send.ok(link.res, cart ? cart.items : {});
        });
    });
};

exports.remove = function(link) {

    if (!link.session) {
        send.badrequest(link, "Only applications using sessions can use a 'server' cart");
        return;
    }

    if (!link.data) {
        send.badrequest(link, { status: "Missing data" });
    }

    getCollection(link, function(err, collection) {

        if (err) {
            send.badrequest(link, err);
            return;
        }

        var data = link.data || {};

            var unset = {};
            unset["items." + data._id] = 1;

            collection.update({ _id: link.session.id }, { $unset: unset }, { safe: true }, function(err, results) {

            if (err) {
                send.badrequest(link, err);
                return;
            }

            send.ok(link.res, { status: "OK" });
        });
    });
};

function getCollection(link, callback) {

    resolveDataSource(link, function(err, ds) {

        if (err) { return callback(err); }

        openDatabase(ds, function(err, db) {

            if (err) { return callback(err); }

            db.collection(ds.collection, function(err, collection) {

                if (err) { return callback(err); }

                callback(null, collection);
            });
        });
    });
}


//exports.update = function(link) {
//    send.ok(link.res, { status: "OK" });
//};


function removeItem(id) {
    for (var i in items) {
        if (items[i] && (items[i].id + "") == (id + "")) {
            items.splice(i, 1);
            break;
        }
    }
}

function resolveDataSource(link, callback) {

    if (!link.params || !link.params.ds) {
        return callback("This operation is missing the data source.");
    }

    // TODO here comes the API that gets the data source for application/user
    var ds = dataSources[link.params.ds];

    if (!ds) {
        return callback("Invalid data source for this application: " + link.params.ds);
    }

    callback(null, ds);
}

function openDatabase(dataSource, callback) {

    if (!dataSource || !dataSource.db) {
        return callback("Invalid data source.");
    }

    switch (dataSource.type) {
        case "mongo":

            // check the cache first maybe we have it already
            if (databases[dataSource.db]) {
                callback(null, databases[dataSource.db]);
                return;
            }

            // open a new connection to the database
            var server = new Server('localhost', 27017, { auto_reconnect: true, poolSize: 5 });
            var db = new Db(dataSource.db, server, { safe: false });

            // cache this db connection
            databases[dataSource.db] = db;

            db.open(callback);
            return;

        default:
            return callback("Invalid data source type: " + dataSource.type);
    }
}

