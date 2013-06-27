
function assureSession(link, callback) {

    if (link.session._sid) {
        return callback(null);
    }

    M.session.start(link, link.session._rid, -1, link.session._loc, function(err, session) {
        return callback(null);
    });
}

exports.create = function(link) {

    assureSession(link, function() {

        if (!link.session._sid) {
            link.send(500, "Could not create a session for your cart");
            return;
        }

        if (!link.data) {
            link.send(400, { status: "Missing data" });
            return;
        }

        M.datasource.resolve(link.params.dsCarts, function(err, ds) {

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

                    getCart(collection, link.session._sid, function(err, cart) {

                        if (err) {
                            link.send(400, err);
                            return;
                        }

                        var data = link.data;
                        data.quantity = data.quantity || 1;

                        if (isNaN(data.quantity) || data.quantity < 1) {
                            data.quantity = 1;
                        }

                        var items = cart.items;
                        if (items[data._id]) {
                            data.quantity = items[data._id].quantity + data.quantity;
                        }

                        var set = {};
                        set["items." + data._id] = data;

                        verifyStock(link.params.dsArticles, data, function (err) {

                            if (err) {
                                link.send(400, err);
                                return;
                            }

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
        });
    })
};

function getCart(collection, cid, callback) {

    if (!cid) { return callback("Invalid cart ID"); }

    collection.findOne({ _id: cid }, function(err, cart) {

        if (err) { return callback(err); }

        // a cart found with this ID
        if (cart) { return callback(null, cart); }

        // we must create a new cart
        collection.insert({ _id: cid, items: {} }, function(err, results) {

            if (err || !results.length) { return callback("Could not create a new cart."); }

            // return the newly created cart
            callback(null, results[0]);
        });
    });
}

exports.read = function(link) {

    // for public sessions, we return an empty cart
    if (!link.session._sid) {
        link.send(200, []);
        return;
    }

    M.datasource.resolve(link.params.dsCarts, function(err, ds) {

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

                collection.findOne({ _id: link.session._sid }, function(err, cart) {

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

exports.update = function(link) {

    if (!link.session._sid) {
        link.send(400, "You are not logged in.");
        return;
    }

    if (!link.data) {
        link.send(400, "Missing data.");
        return;
    }

    if (!link.data._id) {
        link.send(400, "Missing mongo id.");
        return;
    }

    M.datasource.resolve(link.params.dsCarts, function(err, ds) {

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

                var set = {};
                set["items." + data._id] = data;

                verifyStock(link.params.dsArticles, data, function (err) {

                    if (err) {
                        link.send(400, err);
                        return;
                    }

                    collection.update({ _id: link.session._sid }, { $set: set }, function(err, results) {

                        if (err) {
                            link.send(400, err);
                            return;
                        }

                        if (results != 1) {
                            return console.error("Could not update the item from the cart.");
                        }

                        link.send(200);
                    });
                });
            });
        });
    });
};

exports.computeCosts = function(link) {

    // for public sessions, we return an empty cart
    if (!link.session._sid) {
        link.send(200, []);
        return;
    }

    if (!link.params.computeCustomFile) {
        link.send(400, "Missing computeCustomFile.");
        return;
    }

    M.datasource.resolve(link.params.dsCarts, function(err, ds) {

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

                collection.findOne({ _id: link.session._sid }, function(err, cart) {

                    if (err) {
                        link.send(400, err);
                        return;
                    }

                    var Custom = require(M.app.getPath() + '/' + link.params.computeCustomFile);

                    var costs = {
                        subtotal: 0,
                        total: 0
                    };

                    for (var i in cart.items) {
                        var item = cart.items[i];

                        costs.subtotal += item.price * item.quantity;
                    }

                    Custom.getCost(costs, link, cart.items, function (err, costs) {

                        if (err) {
                            link.send(400, err);
                            return;
                        }

                        link.send(200, costs);
                    });
                });
            });
        });
    });
};
exports.remove = function(link) {

    if (!link.session._uid) {
        link.send(401, "You must log in before accessing the cart");
        return;
    }

    if (!link.data) {
        link.send(400, { status: "Missing data" });
        return;
    }

    M.datasource.resolve(link.params.dsCarts, function(err, ds) {

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

                collection.update({ _id: link.session._sid }, { $unset: unset }, { safe: true }, function(err, results) {

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


/*
 *  Verify the stock
 *
 *  Returns an error if too much items are bought
 *  (more than in stock)
 * */
function verifyStock (dsArticles, item, callback) {

    M.datasource.resolve(dsArticles, function(err, ds) {

        if (err) {
            callback(err);
            return;
        }

        M.database.open(ds, function(err, db) {

            if (err) {
                callback(err);
                return;
            }

            db.collection(ds.collection, function(err, collection) {

                if (err) {
                    callback(err);
                    return;
                }

                var mId = M.mongo.ObjectID(item._id);
                collection.findOne({ "_id": mId }, function(err, article) {

                    if (err) {
                        callback(err);
                        return;
                    }

                    if (article.amount - item.quantity < 0) {
                        return callback("We have only " + article.amount + " items of " + item.name + " in stock. You've chosen " + item.quantity + ".");
                    }

                    callback(null);
                });
            });
        });
    });
}
