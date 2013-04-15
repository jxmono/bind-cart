
exports.create = function(link) {

    if (!link.session._sid) {
        link.send(401, "You must log in before adding items to the cart");
        return;
    }

    if (!link.data) {
        link.send(400, { status: "Missing data" });
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

                getCart(collection, link.session._sid, function(err, cart) {

                    if (err) {
                        link.send(400, err);
                        return;
                    }

                    var data = link.data;
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

exports.remove = function(link) {

    if (!link.session._uid) {
        link.send(401, "You must log in before accessing the cart");
        return;
    }

    if (!link.data) {
        link.send(400, { status: "Missing data" });
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

