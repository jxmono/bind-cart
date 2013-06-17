var Bind = require("github/jillix/bind");
var Events = require("github/jillix/events");

function Cart(module) {

    var self;
    var config;
    var container;
    var template;
    var items = [];

    function processConfig(config) {
        config.options = config.options || {};
        config.options.type = config.options.type || "cookie";

        if (config.options.type === "cookie") {
            config.options.cookie = "cart";
        }

        config.options.priceKey = config.options.priceKey || "price";
        config.options.quantityKey = config.options.quantityKey || "quantity";

        config.template.binds = config.template.binds || [];

        var optClasses = config.options.classes || {}
        optClasses.item = optClasses.item || "item";
        optClasses.empty = optClasses.empty || "empty";
        optClasses.content = optClasses.content || "content";
        optClasses.confirm = optClasses.config || "confirm";
        config.options.classes = optClasses;

        return config;
    }

    function init(conf) {

        // initialize the globals
        self = this;
        config = processConfig(conf);
        if (config.container) {
            container = $(config.container, module.dom);
        } else {
            container = module.dom;
        }
        template = $(config.template.value, module.dom);

        // **************************************
        // generate general binds from the config
        var binds = [];

        for (var i in config.controls) {
            switch (i) {
                case "add":
                    binds.push({
                        target: config.controls[i],
                        context: ".controls",
                        on: [{
                            name: "click",
                            emit: "requestNewItem"
                        }]
                    });
                    break;
                case "delete":
                    binds.push({
                        target: config.controls[i],
                        context: ".controls",
                        on: [{
                            name: "click",
                            handler: "removeSelected"
                        }]
                    });
                    break;
            }
        }

        // run the internal binds
        for (var i in binds) {
            Bind.call(self, binds[i]);
        }

        // run the binds
        for (var i in config.binds) {
            Bind.call(self, config.binds[i]);
        }

        Events.call(self, config);

        showEmpty(true);

        self.read();
    }

    // TODO call this from a checkout operation link response if success
    function checkoutDone() {
        clearList();
        items = [];
        if (config.options.type === "cookie") {
            $.cookie.json = true;
            $.cookie("cart", items, { path: "/" });
        }

        showError();
        showOrdered();
    }

    function checkout() {

        var agb = $(".agb", self.dom).find("input").andSelf().find("input[type='checkbox']");
        if (agb.length) {
            if (agb.is(":checked")) {
                agb.get(0).checked = false;
                checkoutDone();
            }
            else {
                showError("Please agree to the terms and conditions");
            }
            return;
        }
        checkoutDone();
    }

    var renderers = {
        selector: function(item) {
            // TODO where do we know the key is the _id
            var existingItem = container.find("#" + item._id);

            // new item type in the cart
            if (!existingItem.length) {

                var newItem = $(template).clone();
                newItem
                    .removeClass("template")
                    .addClass(config.options.classes.item)
                    .appendTo(container)
                    .show();

                for (var i in config.template.binds) {
                    var bindObj = config.template.binds[i];
                    bindObj.context = newItem;
                    Bind.call(self, bindObj, item);
                }

                // now there should be an element with this id
                existingItem = container.find("#" + item._id);
            }

            var qKey = config.options.quantityKey;
            existingItem.find(".quantity").each(function() {

                var elem = $(this);

                switch (this.tagName) {
                    case "INPUT":
                        var initialAdd = elem.val() == 0;
                        elem.attr("value", item[qKey]);
                        elem.val(item[qKey]);
                        if (initialAdd) {
                            elem.on("change", function() {
                                blockCart();
                                var newVal = parseInt($(this).val());
                                if (isNaN(newVal) || newVal < 0) {
                                    $(this).val(item.quantity);
                                    unblockCart();
                                } else if (newVal === 0) {
                                    existingItem.fadeOut(function() {
                                        item.quantity = newVal;
                                        removeItem(item);
                                        unblockCart();
                                    });
                                } else {
                                    item.quantity = newVal;
                                    updateItem(item);
                                }
                            });
                        }
                        break;
                    default:
                        elem.text(item[qKey]);
                }
            });

            return;
        }
    };

    function blockCart() {
        container.find('input').prop('disabled', true);
    }

    function unblockCart() {
        container.find('input').prop('disabled', false);
    }

    function render(items) {
        if (!items || !items.length) {
            showEmpty(true);
            return;
        }

        showEmpty(false);

        var renderer = renderers[config.template.type];
        if (!renderer) {
            showError("No renderer found for templates of type: " + config.template.type);
        }
        for (var i in items) {
            renderer.call(self, items[i]);
        }
    }

    function renderItem(item) {

        if (!item) {
            return;
        }

        var renderer = renderers[config.template.type];
        if (!renderer) {
            showError("No renderer found for templates of type: " + config.template.type);
        }
        showEmpty(false);
        renderer.call(self, item);
    }

    function clearList() {
        $("." + config.options.classes.item, container).remove();
    }

    // ********************************
    // Public functions ***************
    // ********************************

    var readFrom = {
        memory: function(callback) {
            callback(null, items);
        },
        cookie: function(callback) {
            $.cookie.json = true;
            items = $.cookie(config.options.cookie) || [];
            callback(null, items);
        },
        server: function(callback) {
            self.link(config.crud.read, function(err, data) {
                if (err) { return callback(err); }
                items = [];
                for (var i in data) {
                    items.push(data[i]);
                }
                callback(null, items);
            });
        }
    }

    function read() {

        clearList();

        var reader = readFrom[config.options.type];
        if (reader) {
            reader.call(self, function(err, items) {
                if (err) {
                    showError(JSON.stringify(err));
                    return;
                }
                render.call(self, items);
                updateTotal();
            });
        }
    }

    function showEmpty(empty) {
        if (empty) {
            $("." + config.options.classes.empty, self.dom).show();
            $("." + config.options.classes.content, self.dom).hide();
            $("." + config.options.classes.confirm, self.dom).hide();
            $(".agb", self.dom).get(0).checked = false;
        } else {
            $("." + config.options.classes.empty, self.dom).hide();
            $("." + config.options.classes.content, self.dom).show();
            $("." + config.options.classes.confirm, self.dom).hide();
        }
    }

    function showOrdered() {
        $("." + config.options.classes.empty, self.dom).hide();
        $("." + config.options.classes.content, self.dom).hide();
        $("." + config.options.classes.confirm, self.dom).show();
    }

    function showError(message) {
        if (!message) {
            $(".error").text("").hide();
        } else {
            $(".error").text(message).show();
        }
    }

    var adders = {
        cookie: function(item, callback) {
            $.cookie.json = true;
            var cart = $.cookie("cart") || [];
            var found = false;
            for (var i in cart) {
                if (cart[i]._id === item._id) {
                    // TODO support incomming item.quantity
                    ++(cart[i][config.options.quantityKey]);
                    item = cart[i];
                    found = true;
                    break;
                }
            }
            if (!found) {
                item[config.options.quantityKey] = 1;
                cart.push(item);
                item = cart[cart.length - 1];
            }

            $.cookie.json = true;
            $.cookie("cart", cart, { path: "/" });
            items = cart;

            callback(null, item);
        },

        server: function(item, callback) {
            self.link(config.crud.create, { data: item }, function(err, confirmedItem) {
                if (err) { return callback(err); }

                var found = false;
                for (var i in items) {
                    if (items[i]._id === confirmedItem._id) {
                        items[i] = confirmedItem;
                        found = true;
                    }
                }

                if (!found) {
                    items.push(confirmedItem);
                }

                callback(null, confirmedItem);
            });
        },

        memory: function(item, callback) {
            // TODO in memory type the quantity is saved in the memory object and will
            // be reused later, which is wrong
            var newItem = {};
            var qKey = config.options.quantityKey;

            for (var i in item) {
                newItem[i] = item[i];
            }
            item = newItem;

            var found = false;
            for (var i in items) {
                if (items[i]._id === item._id) {
                    item = items[i];
                    ++(item[qKey]);
                    found = true;
                }
            }

            if (!found) {
                item[qKey] = 1;
                items.push(item);
            }

            callback(null, item);
        }
    };

    function addItem(itemData) {
        showError();

        var adder = adders[config.options.type];
        if (!adder) {
            showError("No item adder was found for cart type: " + config.options.type);
            return;
        }
        adder.call(self, itemData, function(err, item) {
            if (err) {
                showError(JSON.stringify(err));
                return;
            }
            renderItem(item);
            updateTotal();
        });
    }

    function updateTotal() {
        var total = 0;
        for (var i in items) {
            var priceStr = items[i][config.options.priceKey];
            var quantityStr = items[i][config.options.quantityKey];
            var price = parseInt(priceStr);
            var quantity = parseInt(quantityStr);

            if (!isNaN(price) && !isNaN(quantity)) {
                total += price * quantity;
            }
        }
        $("#total", self.dom).text(total.toFixed(2));
    }

    function readQuantityFromItem(elem) {

        var quantityElem = elem.find(".quantity").first();
        if (!quantityElem.length) {
            return 1;
        }

        var value = 1;
        var textVal = null;

        switch (quantityElem[0].tagName) {
            case "INPUT":
                textVal = quantityElem.val();
                break;
            default:
                textVal = quantityElem.text();
        }
        var parsedVal = parseInt(textVal);
        if (!isNaN(parsedVal)) {
            value = parsedVal + 1;
        }

        return value;
    }

    function emptyCart() {
        $("." + config.options.classes.item, self.dom).each(function() {
            var item = {
                _id: $(this).attr("id")
            }
            removeItem(item);
        });
    }

    function updateItem(item) {
        self.link(config.crud.update, { data: item }, function (err, data) {
            updateTotal();
            unblockCart();
        });
    }

    function removeItem(itemData) {
        showError();

        function removeUiItem() {
            // TODO where do we get the _id key from?
            container.find("#" + itemData._id).remove();
            updateTotal();

            // if no more items, show empty cart
            if (container.find("." + config.options.classes.item).length == 0) {
                showEmpty(true);
            }
        }

        function removeCacheItem() {
            var newItems = [];
            for (var i in items) {
                if (items[i]._id !== itemData._id) {
                    newItems.push(items[i]);
                }
            }
            items = newItems;
            updateTotal();
        }

        switch (config.options.type) {
            case "server":
                self.link(config.crud.delete, { data: { _id: itemData._id } }, function(err, data) {
                    if (err) { return; }
                    removeUiItem();
                    removeCacheItem();
                });
                break;

            case "memory":
                // a memory-based cart should not make any requests, just remove the item
                removeUiItem();
                removeCacheItem();
                // and show an empty cart when no more items in it
                var itemElems = container.find("." + config.options.classes.item);
                showEmpty(!itemElems.length);
                break;

            case "cookie":
                // search in the cart cookie for the item with this ID and remove it
                var cart = $.cookie("cart");
                for (var i in cart) {
                    if (cart[i]._id === itemData._id) {
                        cart.splice(i, 1);
                        break;
                    }
                }
                // if the cart is already empty it should be displayed as so
                showEmpty(!cart || !cart.length);
                // save back the updated cart in the cookie
                $.cookie("cart", cart, { path: "/"});
                // and also remove the item from the UI
                removeUiItem();
                removeCacheItem();
                break;
        }
    }

    function show() {
        $(self.dom).parent().show();
    }

    function hide() {
        $(self.dom).parent().hide();
    }

     return {
        init: init,
        read: read,
        addItem: addItem,
        updateItem: updateItem,
        removeItem: removeItem,
        emptyCart: emptyCart,
        checkout: checkout,
        show: show,
        hide: hide
    };
}

module.exports = function(module, config) {

    var cart = new Cart(module);
    for (var i in cart) {
        cart[i] = module[i] || cart[i];
    }
    cart = Object.extend(cart, module);

    cart.init(config);

    return cart;
};

