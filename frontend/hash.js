const bcrypt = require("bcryptjs");

bcrypt.hash("1236", 10).then(hash => {
  console.log(hash);
});
