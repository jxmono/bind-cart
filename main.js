define(["github/adioo/bind-cart-dev/v0.1.0/cart"], function(Cart) {

    var self;

    function init(config) {

        config.crud = {
            create: "create",
            read:   "read",
            update: "update",
            delete: "remove"
        }

        this.lang = "de";
        config.options.type = "server";
        self = Cart(this, config);
    }

    return init;
});

