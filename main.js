define(["github/adioo/bind-cart/v0.0.4/cart"], function(Cart) {

    var self;

    function init(config) {

        config.crud = {
            create: "create",
            read:   "read",
            update: "update",
            delete: "remove"
        }

        self = Cart(this, config);
    }

    return init;
});

