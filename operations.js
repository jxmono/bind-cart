var mongo = require("mongodb");
var Server = mongo.Server;
var Db = mongo.Db;

var dataSources = {
    cartDS: {
        type: "mongo",
        db: "aktionshop",
        collection: "carts"
    }
}

var databases = {};

exports.create = function(link) {

    if (!link.session) {
        link.send(400, "Only applications using sessions can use a 'server' cart");
        return;
    }

    var data = link.data;

    if (!data) {
        link.send(400, { status: "missing data" });
        return;
    }

    M.datasource.resolve(link.params.ds, function(err, ds) {

        if (err) {
            link.send(400, err);
            return;
        }

        M.database.open(ds, function(err, db) {

            if (err) {
                link.send(400, err);
                return;
            }

            db.collection(ds.collection, function(err, collection) {

                if (err) {
                    link.send(400, err);
                    return;
                }

                getCart(collection, link, function(err, cart) {

                    if (err) {
                        link.send(400, err);
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
                            link.send(400, err);
                            return;
                        }

                        if (results != 1) {
                            return console.error("Could not add item to the cart.");
                        }

                        link.send(200, data);
                    });
                });
            });
        });
    });
};

function getCart(collection, link, callback) {

    collection.findOne({ _id: link.session.id }, function(err, cart) {

        if (err) {
            link.send(400, err);
            return;
        }

        if (cart) {
            return callback(null, cart);
        }

        // we must create a new cart
        collection.insert({ _id: link.session.id, items: {} }, function(err, results) {

            if (err) { return callback(err); }

            if (!results.length) { return callback("Could not create new cart."); }

            callback(null, results[0]);
        });
    });

}

exports.read = function(link) {

    if (!link.session) {
        link.send(400, "Only applications using sessions can use a 'server' cart");
        return;
    }

    M.datasource.resolve(link.params.ds, function(err, ds) {

        if (err) {
            link.send(400, err);
            return;
        }

        M.database.open(ds, function(err, db) {

            if (err) {
                link.send(400, err);
                return;
            }

            db.collection(ds.collection, function(err, collection) {

                if (err) {
                    link.send(400, err);
                    return;
                }

                var data = link.data || {};

                collection.findOne({ _id: link.session.id }, function(err, cart) {

                    if (err) {
                        link.send(400, err);
                        return;
                    }

                    link.send(200, cart ? cart.items : {});
                });
            });
        });
    });
};

exports.remove = function(link) {

    if (!link.session) {
        link.send(400, "Only applications using sessions can use a 'server' cart");
        return;
    }

    if (!link.data) {
        link.send(400, { status: "Missing data" });
    }

    M.datasource.resolve(link.params.ds, function(err, ds) {

        if (err) {
            link.send(400, err);
            return;
        }

        M.database.open(ds, function(err, db) {

            if (err) {
                link.send(400, err);
                return;
            }

            db.collection(ds.collection, function(err, collection) {

                if (err) {
                    link.send(400, err);
                    return;
                }

                var data = link.data || {};

                var unset = {};
                unset["items." + data._id] = 1;

                collection.update({ _id: link.session.id }, { $unset: unset }, { safe: true }, function(err, results) {

                    if (err) {
                        link.send(400, err);
                        return;
                    }

                    link.send(200, { status: "OK" });
                });
            });
        });
    });
};

exports.checkout = function(link) {

    // TODO add checkout with data for non-server carts and without data for server carts
    // also the operation must receive the cart type to properly perform error handling
    if (!link.session) {
        link.send(400, "Only applications using sessions can use a 'server' cart");
        return;
    }

    M.datasource.resolve(link.params.ds, function(err, ds) {

        if (err) {
            link.send(400, err);
            return;
        }

        M.database.open(ds, function(err, db) {

            if (err) {
                link.send(400, err);
                return;
            }

            db.collection(ds.collection, function(err, collection) {

                if (err) {
                    link.send(400, err);
                    return;
                }

                // TODO implement the logic and use findAndRemove instead of remove such that
                // we can process the cart or add it back it something goes wrong
                console.error("Cart checkout functionality not implemented!!!");

                collection.remove({ _id: link.session.id }, { safe: true }, function(err, results) {

                    if (err) {
                        link.send(400, err);
                        return;
                    }

                    link.send(200, { status: "OK" });
                });
            });
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

