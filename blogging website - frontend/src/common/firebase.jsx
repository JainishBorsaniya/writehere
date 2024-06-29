import { initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, signInWithPopup } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBIYU5awWEhwsI9reHRM4pX34jPQv9NIkI",
  authDomain: "blog-website-30310.firebaseapp.com",
  projectId: "blog-website-30310",
  storageBucket: "blog-website-30310.appspot.com",
  messagingSenderId: "650847395886",
  appId: "1:650847395886:web:2b0658beb343714ee9bfbf"
};

const app = initializeApp(firebaseConfig);

const provider = new GoogleAuthProvider();

const auth = getAuth();

export const authWithGoogle = async () => {

  let user = null;

  await signInWithPopup(auth, provider)
    .then((result) => {
      user = result.user
    })

    return user;
}