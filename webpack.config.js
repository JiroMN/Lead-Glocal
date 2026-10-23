const path = require("path");

module.exports = {
  mode: "production", // Minified
  entry: {
    // What file to take and where to put it
    ["index"]: "./src/index.js",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js", // Creates file name in 'dist' folder
    // Lazy-loaded chunks (e.g. three.js for the business card) are fetched
    // relative to wherever index.js was loaded from: jsDelivr or localhost.
    chunkFilename: "chunks/[name].[contenthash:8].js",
    publicPath: "auto",
    library: "[name]",
    libraryTarget: "umd",
    globalObject: "this",
    umdNamedDefine: true,
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.vcf$/,
        type: "asset/source",
      },
    ],
  },
};
