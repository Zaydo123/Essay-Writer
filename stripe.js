const stripe = require('stripe')(process.env.STRIPE_API);
const productsJson = require('./products.json');
const tiersJson = require('./tiers.json');
module.exports = function(express,bodyParser,app,db,ENDPOINT_SECRET,DOMAIN) {

  function fulfillOrder(customer, email, mode, subscription, product_id,transaction_id) {

    let product = productsJson[product_id];

    if(email == null) {
      email = 'admin@physics-chat.com';
    }
 
    let order = {product:product_id,price:product['price'],email:email,mode:mode,subscription:subscription,transaction_id:transaction_id};

    if(mode) {

      /* tiers.json

          "basic": {
            "stripe_id":"prod_NTTV4au7YBeoHw",
            "tokens": 10000,
            "price": 1,
            "max_tokens": 500,
            "engine": "gpt-3.5-turbo"
          },

      */
      if(mode == 'subscription') {
        //find json key by stripe_id
        let tier = Object.keys(tiersJson).find(key => tiersJson[key].stripe_id === product_id);
        db.setTier(email,tier,function(result) {
          console.log('tier set');
        });
        //email, stripeID, transactionID, transactionMade, subscriptionExpires, notes="", callback)
        db.addSubscriber(email,product_id,transaction_id,Date.now(),Date.now() + 2592000000,'',function(result) { //add 30 days to current date
          console.log('subscription added');
        });
      }

      db.addBalance(email,product['token-amount'],function(result) {  
        db.appendOrder(email,order,function(result) {
          console.log('order added');
        });
      });
    }

  }


  function addRawBody(req, res, next) {
    req.setEncoding('utf8');
  
    var data = '';
  
    req.on('data', function(chunk) {
      data += chunk;
    });
  
    req.on('end', function() {
      req.rawBody = data;
  
      next();
    });
  }

    app.post('/webhook',(request, response) => {
      const event = request.body;
      const sig = request.headers['stripe-signature'];
      addRawBody(request, response, function() {
        try {
          stripe.webhooks.constructEvent(request.rawBody, sig, ENDPOINT_SECRET);
        } catch (err) {
          console.log(err.message)
          return response.status(400).send(`Webhook Error: ${err.message}`);
        }
      });
      
        // Handle the event
        switch (event.type) {

          case 'checkout.session.completed':
            let customer = event.data.object.customer; //customer id or null
            let customerEmail = event.data.object.customer_details.email; //customer email
            let mode = event.data.object.mode; // 'subscription' or 'payment'
            let subscription = event.data.object.subscription; //null if not subscription || sub_1MjEPFLyXGv9FHExxAoitqf7
            let transaction_id = event.data.object.id; //cs_test_a1HeAeBDYzpLZtyhWSr24110Q7P37z9UbVHKt3yvJegrLauNn3Wxzv3JX8
            console.log(`
            customer: ${customer}
            ----------------
            customerEmail: ${customerEmail}
            ----------------
            mode: ${mode}
            ----------------
            subscription: ${subscription}
            ----------------
            `);

            let line_items = stripe.checkout.sessions.listLineItems(
              event.data.object.id,
              { limit: 5 },
              function(err, lineItems) {
                // asynchronously called

                let product_id = lineItems.data[0].price.product;
                fulfillOrder(customer, customerEmail, mode, subscription, product_id,transaction_id);

              }
            );



          default:
            console.log('event');
        }
      
        // Return a response to acknowledge receipt of the event
        response.json({received: true});

      });


}

//C:\Users\andre\Desktop\stripe.exe listen --forward-to localhost:3000/webhook
