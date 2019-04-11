const path = require('path');

module.exports = {
  mode: 'production',
  entry: './app/app.jsx',

  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'bundle.js',
  },

  resolve: {
    extensions: ['.js', '.jsx'],
  },

  module: {
    rules: [
      {
        test: /\.jsx?$/,
        loader: 'jsx-loader',
        include: path.resolve(__dirname, 'app'),
      },
    ],
  },

  devServer: {
    inline: false
  }
};
