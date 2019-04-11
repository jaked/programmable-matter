const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/app.tsx',

  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'bundle.js',
  },

  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },

  module: {
    rules: [
      {
        test: /\.jsx?$/,
        loader: 'jsx-loader',
        include: path.resolve(__dirname, 'src'),
      },
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        include: path.resolve(__dirname, 'src'),
      },
      {
        test: /\.js$/,
        loader: 'source-map-loader',
        enforce: 'pre',
      },
    ],
  },

  devtool: "source-map",

  devServer: {
    inline: false
  }
};
