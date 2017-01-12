/**
 * Server main
 *
 * @since 1.0.0
 *
 */

const Hapi = require('hapi');

const vision = require('vision');
const inert = require('inert');
const HapiAuthJwt2 = require('hapi-auth-jwt2');
const HapiReactViews = require('hapi-react-views');

const apiRouter = require('./router/api-router');
const baseRouter = require('./router/ui-router');
const User = require('./repository/User');

const config = require('./config/server.config');
const RidiError = require('./common/Error');

const util = require('./common/util');

// For JSX transpiling
require('babel-register');
require('babel-polyfill');

const server = new Hapi.Server();
server.connection({ port: process.env.PORT || config.defaults.port });

server.state('token', {
  ttl: config.auth.tokenTTL,
  isSecure: process.env.USE_HTTPS && process.env.USE_HTTPS === 'true',
  path: '/',
});

const plugins = [
  { register: vision },
  { register: inert },
  { register: HapiAuthJwt2 },
];

const _setAuthStrategy = () => {
  server.auth.strategy('jwt', 'jwt', {
    key: process.env.SECRET_KEY || config.auth.secretKey,
    validateFunc: (decoded, request, callback) => {
      // Check token IP address
      const clientIP = util.getClientIp(request);
      if (clientIP !== decoded.ip) {
        console.warn(`[Auth] This client IP is matched with token info.: decoded.ip => ${decoded.ip}, client IP => ${clientIP}`);
        return callback(new RidiError(RidiError.Types.AUTH_TOKEN_INVALID), false);
      }
      // Check token expiration
      if (decoded.exp < new Date().getTime()) {
        console.warn(`[Auth] This auth token is expired.: decoded.exp => ${decoded.exp}, now => ${new Date().getTime()}`);
        return callback(new RidiError(RidiError.Types.AUTH_TOKEN_EXPIRED), false);
      }
      return User.find({ username: decoded.username })
        .then(account => callback(null, account && account.length > 0))
        .catch(() => {
          console.warn(`[Auth] This account is not exist.: ${decoded.username}`);
          callback(new RidiError(RidiError.Types.AUTH_USER_NOT_EXIST, { username: decoded.username }), false);
        });
    },
    verifyOptions: { algorithms: ['HS256'] },
  });

  server.auth.default('jwt');
};

const _setViewEngine = () => {
  server.views({
    engines: { jsx: HapiReactViews },
    relativeTo: __dirname,
    path: config.directory.component,
  });
};

const _setRoutes = (extraRoutes) => {
  // for static assets
  server.route({
    method: 'GET',
    path: `${config.url.publicPrefix}/{param*}`,
    handler: {
      directory: {
        path: config.directory.public,
        listing: false,
      },
    },
    config: {
      auth: false,
    },
  });
  server.route(apiRouter);
  server.route(baseRouter);
  if (extraRoutes) {
    server.route(extraRoutes);
  }
};

const _setExtensions = () => {
  server.ext('onPostAuth', (request, reply) => {
    if (request.params) {
      request.params = util.snake2camelObject(request.params);
    }
    if (request.query) {
      request.query = util.snake2camelObject(request.query);
    }
    if (request.payload) {
      request.payload = util.snake2camelObject(request.payload);
    }
    return reply.continue();
  });

  server.ext('onPreResponse', (request, reply) => {
    const path = request.path;
    const statusCode = request.response.statusCode || request.response.output.statusCode;

    if (path.includes(config.url.apiPrefix)) {
      // API
      let responseObj = {};
      if (statusCode !== 200) {
        responseObj = { code: request.response.errorCode, message: request.response.message };
      } else if (request.response.source) {
        responseObj = util.camel2snakeObject(request.response.source);
      }
      switch (statusCode) {
        case 401:
        case 403:
          return reply(responseObj).unstate('token');
        default:
          return reply(responseObj);
      }
    } else {
      // UI
      switch (statusCode) {
        case 401:
        case 403:
          return reply.redirect(`/login?redirect=${request.path || '/'}`).unstate('token');
        default:
          break;
      }
    }
    return reply.continue();
  });
};

exports.addPlugin = (pluginSetting) => {
  plugins.push(pluginSetting);
};

exports.start = (extraRoutes) => {
  return server.register(plugins)
    .then(() => {
      _setAuthStrategy();
      _setViewEngine();
      _setRoutes(extraRoutes);
      _setExtensions();
      return server;
    })
    .then(() => server.start())
    .then(() => {
      console.log('Server running at:', server.info.uri);
      return server;
    })
    .catch((error) => { throw error; });
};
