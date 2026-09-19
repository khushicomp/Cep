const bcrypt = require("bcryptjs");

bcrypt.hash("1236", 10).then(() => {
  console.log("Hash generated successfully");
});
