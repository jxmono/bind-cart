
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

        getCollection(link.params.dsCarts, function(err, collection) {

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

                        var payments = link.session.payments || {};
                        payments.orderid = cart._id;

                        link.session.set({ payments: payments }, function (err) {

                            if (err) {
                                link.send(400, err);
                                return;
                            }

                            link.send(200, data);
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

    getCollection(link.params.dsCarts, function(err, collection) {

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

    var session = link.session;
    session.checkout = session.checkout || {};

    if (session.checkout.paying) {
        link.send(400, "You cannot modify the cart while you are paying.");
        return;
    }

    if (session.checkout.paid) {
        link.send(400, "You cannot modify the cart because you've already paid.");
        return;
    }

    getCollection(link.params.dsCarts, function(err, collection) {

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

    getCollection(link.params.dsCarts, function(err, collection) {

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

            var Custom;

            try {
                Custom = require(M.app.getPath() + '/' + link.params.computeCustomFile);
            } catch (e) { return link.send(400, e.message); }

            var costs = {
                subtotal: 0,
                total: 0
            };

            costs.items = {};

            if (!cart) {
                link.send(200, costs);
                return;
            }

            for (var i in cart.items) {
                var item = cart.items[i];
                var itemTotal = item.price * item.quantity;

                costs.items[i] = {
                    total: itemTotal
                };

                costs.subtotal += itemTotal;
            }

            Custom.getCost(costs, link, cart.items, function (err, costs) {

                if (err) {
                    link.send(400, err);
                    return;
                }

                var checkout = link.session.checkout || {};
                checkout.costs = costs;

                link.session.set({ checkout: checkout }, function (err) {

                    if (err) {
                        link.send(400, err);
                        return;
                    }

                    // validate limits if link.params.validateLimits
                    if (link.params.validateLimits) {

                        getCollection(link.params.dsSettings, function (err, collection) {

                            if (err) {
                                link.send(400, err);
                                return;
                            }

                            collection.findOne({}, function (err, settings) {

                                if (err) {
                                    link.send(400, err);
                                    return;
                                }

                                settings = settings || {};
                                settings.limits = settings.limits || {};
                                settings.limits = {
                                    min: settings.limits.min || 0,
                                    max: settings.limits.max || 0
                                }

                                var limits = settings.limits;
                                if (costs.subtotal && costs.subtotal < limits.min || costs.subtotal > limits.max) {
                                    costs.error = {
                                        message: "The subtotal should be between {0} and {1} {2}.",
                                        params: [
                                            (limits.min / 100).toFixed(2),
                                            (limits.max / 100).toFixed(2),
                                            "CHF"
                                        ]
                                    };
                                }

                                link.send(200, costs);
                            });
                        });

                        return;
                    }

                    link.send(200, costs);
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

    getCollection(link.params.dsCarts, function(err, collection) {

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
};

exports.checkout = function(link) {

    // TODO add checkout with data for non-server carts and without data for server carts
    // also the operation must receive the cart type to properly perform error handling
    if (!link.session) {
        link.send(400, "Only applications using sessions can use a 'server' cart");
        return;
    }

    getCollection(link.params.ds, function(err, collection) {

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
};

/*
 *  Verify the stock
 *
 *  Returns an error if too much items are bought
 *  (more than in stock)
 * */
function verifyStock (dsArticles, item, callback) {

    getCollection(dsArticles, function (err, collection) {

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
                var err = {
                    message: "We have only {0} items of {1} in stock. You've chosen {2}.",
                    params: [
                        article.amount,
                        item.name,
                        item.quantity
                    ]
                };
                return callback(err);
            }

            callback(null);
        });
    });
}

function getCollection (datasource, callback) {

    M.datasource.resolve(datasource, function(err, ds) {

        if (err) {
            callback(err);
            return;
        }

        M.database.open(ds, function(err, db) {

            if (err) {
                callback(err);
                return;
            }

            db.collection(ds.collection, callback);
        });
    });
}
