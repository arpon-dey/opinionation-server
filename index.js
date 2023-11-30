const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bpsqjlp.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();

    const usersCollection = client.db("surveyDB").collection("users");
    const surveyCollection = client.db("surveyDB").collection("survey");
    const voteCollection = client.db("surveyDB").collection("vote");
    const paymentCollection = client.db("surveyDB").collection("payments");
    const commentCollection = client.db("surveyDB").collection("comment");
    const reportCollection = client.db("surveyDB").collection("report");

    //jwt api

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      //   console.log(user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "2hr",
      });
      res.send({ token });
    });

    const verifyToken = (req, res, next) => {
      console.log(req.headers);
      if (!req.headers.authorization) {
        return res.status(403).send("Access Denied");
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(403).send("Invalid Token");
        }
        req.decoded = {
          email: decoded.email,
          decoded,
        };
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send("You are not an admin!");
      }
      next();
    };

   

    //Payment api
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    app.get("/payments",verifyToken, async (req, res) => {
        try {
            const result = await paymentCollection.find().toArray();
            res.send(result);
        } catch (error) {
            res.status(500).send('Internal Server Error');
        }
    });
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      console.log("payment info", payment);

      res.send(paymentResult);
    });

    //comment api

    app.get("/comment",verifyToken, async (req, res) => {
      const result = await commentCollection.find().toArray();
      res.send(result);
    });

    app.post("/comment", async (req, res) => {
      const comment = req.body;
      const result = await commentCollection.insertOne(comment);
      res.send(result);
    });


    //Report api

    app.get("/report", verifyToken, async (req, res) => {
      const result = await reportCollection.find().toArray();
      res.send(result);
    });

    app.post("/report", async (req, res) => {
      const comment = req.body;
      const result = await reportCollection.insertOne(comment);
      res.send(result);
    });

    //Survey api
    app.get("/survey",  async (req, res) => {
      const result = await surveyCollection.find().toArray();
      res.send(result);
    });

    
    app.get('/survey/update/:id', verifyToken, async (req, res) => {
        const id = req.params.id
        const query = { _id: new ObjectId(id) };
        const result = await surveyCollection.findOne(query)
        res.send(result);
    });

    app.put('/survey/update/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) }
        const options = { upsert: true };
        const updateSurvey = req.body;

        const survey = {
            $set: {
                name: updateSurvey.name,
                category: updateSurvey.category,
                query1: updateSurvey.query1,
                query2: updateSurvey.query2,
                description: updateSurvey.description,
                image: updateSurvey.image
            }
        }
        const result = await surveyCollection.updateOne(filter, survey, options);
        res.send(result);
    })

    app.post("/survey", verifyToken, async (req, res) => {
      const item = req.body;
      const timestamp = new Date();
      item.timestamp = timestamp;
      const result = await surveyCollection.insertOne(item);
      res.send(result);
    });

    app.get("/survey/:id",  async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await surveyCollection.findOne(query);
      res.send(result);
    });

    //voting api

    app.get("/vote", async (req, res) => {
      const result = await voteCollection.find().toArray();
      res.send(result);
    });

    app.get("/vote", async (req, res) => {
      const email = req.query.email;
      console.log("Received email:", email);
      const query = { voterEmail: email };
      const result = await voteCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/vote", async (req, res) => {
      const item = req.body;
      const result = await voteCollection.insertOne(item);
      res.send(result);
    });

    //User api

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const filter = { email: email };
      const result = await usersCollection.findOne(filter);
      res.send(result);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send("Unauthorized");
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.get("/users/surveyor/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send("Unauthorized");
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let surveyor = false;
      if (user) {
        surveyor = user?.role === "surveyor";
      }
      res.send({ surveyor });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exist ", insertedId: null });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = { $set: { role: "admin" } };
        const result = await usersCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );
    app.patch(
      "/users/surveyor/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = { $set: { role: "surveyor" } };
        const result = await usersCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    app.patch("/users/proUser/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      const filter = { email: email };
      const updatedDoc = { $set: { role: "proUser" } };

      try {
        const result = await usersCollection.updateOne(filter, updatedDoc);
        res.send(result);
      } catch (error) {
        console.error("Error updating user role:", error);
        res.status(500).send("Internal Server Error");
      }
    });

  
    app.get("/user-role", verifyToken, async (req, res) => {
        const email = req.decoded.email;
      
        try {
          const query = { email: email };
          const user = await usersCollection.findOne(query);
      
          if (!user) {
            return res.status(404).json({ error: 'User not found' });
          }
      
          const role = user.role;
          res.json({ role });
        } catch (error) {
          console.error("Error fetching user role:", error);
          res.status(500).send("Internal Server Error");
        }
      });

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);

      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("opinioNation running");
});

app.listen(port, () => {
  console.log(`opinioNation is running on port ${port}`);
});
