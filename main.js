var Cart = require('github/jillix/cart');

module.exports = function(config) {

    var self = this;

    config.crud = {
        create: 'create',
        read:   'read',
        update: 'update',
        delete: 'remove'
    }

    self = Cart(this, config);
};

