define(["github/adioo/bind-cart/dev/cart"], function(Cart) {

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

