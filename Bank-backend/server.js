const app = require("./app");


const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
require('./services/runtime-shutdown').installShutdown(server, require('./config/db').promise());
