import express from "express";
import mongoose from "mongoose";
import "dotenv/config";
import bcrypt from "bcrypt";
import { nanoid } from "nanoid";
import jwt from "jsonwebtoken";
import cors from 'cors';
import admin from 'firebase-admin';
import serviceAccountKey from './blog-website-30310-firebase-adminsdk-25uaw-0967550df3.json' assert {type: "json"};
import { getAuth } from 'firebase-admin/auth';
import aws from "aws-sdk";

import User from "./Schema/User.js";

const server = express();
let PORT = 3000;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey)
})

let emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/; // regex for email
let passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{6,20}$/; // regex for password

server.use(express.json());
server.use(cors());

mongoose.connect(process.env.DB_LOCATION, {
  autoIndex: true,
});

// setting up s3 bucket
const s3 = new aws.S3({
  region: 'ap-south-1',
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const generateUploadURL = async () => {

  const date = new Date();
  const imageName = `${nanoid()}-${date.getTime()}.jpeg`;

 return await s3.getSignedUrlPromise('putObject', {
    Bucket: 'medium-blog-wesite',
    Key: imageName,
    Expires: 1000,
    ContentType: "image/jpeg"
  })
}

const formatDataToSend = (user) => {
  const access_token = jwt.sign(
    { id: user._id },
    process.env.SECRET_ACCESS_KEY
  );

  return {
    access_token,
    profile_img: user.personal_info.profile_img,
    username: user.personal_info.username,
    fullname: user.personal_info.fullname,
  };
};

const generateUsername = async (email) => {
  let username = email.split("@")[0];

  let isUsernameNotUnique = await User.exists({
    "personal_info.username": username,
  }).then((result) => result);

  isUsernameNotUnique ? (username += nanoid().substring(0, 5)) : "";

  return username;
};

//upload image url route
server.get('/get-upload-url', (req,res) => {
   generateUploadURL().then(url => res.status(200).json({uploadURL: url}))
   .catch(err => {
    console.log(err.message);
    res.status(500).json({"error": err.message});
   })
})

server.post("/signup", (req, res) => {
  let { fullname, email, password } = req.body;

  if (fullname.length < 3) {
    return res
      .status(403)
      .json({ error: "Fullname must be at least 3 letters long" });
  }
  if (!email.length) {
    return res.status(403).json({ error: "Enter Email" });
  }
  if (!emailRegex.test(email)) {
    return res.status(403).json({ error: "email is invalid" });
  }
  if (!passwordRegex.test(password)) {
    return res.status(403).json({
      error:
        "Password should be 6 to 20 characters long with a numeric, 1 lowercase , 1 uppercase letters.",
    });
  }

  bcrypt.hash(password, 10, async (err, hashed_password) => {
    let username = await generateUsername(email);

    let user = new User({
      personal_info: {
        fullname: fullname,
        email: email,
        password: hashed_password,
        username,
      },
    });

    user
      .save()
      .then((u) => {
        return res.status(200).json(formatDataToSend(u));
      })
      .catch((err) => {
        if (err.code == 11000) {
          return res.status(500).json({ error: "Email already exists." });
        }

        return res.status(500).json({ error: err.message });
      });
  });
});

server.post("/signin", (req, res) => {
  let { email, password } = req.body;

  User.findOne({ "personal_info.email": email })
    .then((user) => {
      if (!user) {
        return res.status(403).json({ 'error': 'Email not found' })
      }

      if (!user.google_auth) {

        bcrypt.compare(password, user.personal_info.password, (err, result) => {
          if (err) {
            return res.status(403).json({ "error": "Error occured while login please try again" })
          }

          if (!result) {
            return res.status(403).json({ "error": "Password incorrect" })
          }
          else {
            return res.status(200).json(formatDataToSend(user))
          }
        })

      } else {
        return res.status(403).json({ "error": "Account was created using google. Try logging in with google." })
      }
    })
    .catch((err) => {
      return res.status(500).json({ "error": err.message });
    });
});

server.post('/google-auth', async (req, res) => {

  let { access_token } = req.body;

  getAuth().verifyIdToken(access_token)
    .then(async (decodedToken) => {

      let { email, name, picture } = decodedToken;

      picture = picture.replace('s96-c', 's384-c')

      let user = await User.findOne({ 'personal_info.email': email })
        .select('personal_info.fullname personal_info.username personal_info.profile_img google_auth')
        .then((u) => {
          return u || null
        })
        .catch((err) => {
          return res.status(500).json({ "error": err.message })
        })

      if (user) { //login
        if (!user.google_auth) {
          return res.status(403).json({ "error": "This email was signed up without google. Please log in with password to access the account" })
        }
      }
      else {
        //signup
        let username = await generateUsername(email);

        user = new User({
          personal_info: { fullname: name, email, username },
          google_auth: true
        })

        await user.save().then((u) => {
          user = u;
        })
          .catch((err) => {
            return res.status(500).json({ "error": err.message })
          })
      }

      return res.status(200).json(formatDataToSend(user));
    })
    .catch(err => {
      return res.status(500).json({ 'error': 'Failed to authenticate you with google. Try with some other google account' })
    })
})

server.listen(PORT, () => {
  console.log("Server listening on port -> ", PORT);
});
