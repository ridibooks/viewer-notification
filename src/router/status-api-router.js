/**
 * Status Service API router
 *
 * @since 1.0.0
 */

const Joi = require('joi');
const Status = require('./../repository/Status');
const config = require('../config/server.config').url;
const dateUtil = require('../common/date-util');

module.exports = [
  {
    method: 'GET',
    path: `${config.statusApiPrefix}`,
    handler: async (request, h) => {
      let filter = {};
      if (request.query.filter === 'current') { // 미래 포함
        filter = {
          $or: [
            { endTime: { $gt: new Date() } },
            { startTime: { $exists: false }, endTime: { $exists: false } },
          ],
        };
      } else if (request.query.filter === 'expired') {
        filter = { endTime: { $lte: new Date() } };
      }
      return Promise.all([
        Status.find(filter, {
          isActivated: -1, startTime: 1, endTime: 1, createTime: 1,
        }, request.query.skip, request.query.limit),
        Status.count(filter),
      ]).then(([list, totalCount]) => h.response({
        data: dateUtil.formatDates(list),
        totalCount,
      }));
    },
    config: {
      validate: {
        query: {
          filter: Joi.any().valid('current', 'expired'),
          skip: Joi.number(),
          limit: Joi.number(),
        },
      },
    },
  },
  {
    method: 'GET',
    path: `${config.statusApiPrefix}/check`,
    handler: (request, h) => Status.findWithComparators(request.query.deviceType
      || '*', request.query.deviceVersion
      || '*', request.query.appVersion
      || '*', { startTime: 1 })
      .then(result => dateUtil.formatDates(result))
      .then(result => h.response({ data: result })),
    config: {
      validate: {
        query: {
          deviceType: Joi.string(),
          deviceVersion: Joi.string().regex(/^[0-9A-Za-z.*-]+$/),
          appVersion: Joi.string().regex(/^[0-9A-Za-z.*-]+$/),
        },
      },
      auth: false,
    },
  },
  {
    method: 'POST',
    path: `${config.statusApiPrefix}`,
    handler: async (request, h) => {
      const status = Object.assign({}, request.payload);
      if (status.startTime && status.endTime) {
        status.startTime = new Date(Date.parse(status.startTime));
        status.endTime = new Date(Date.parse(status.endTime));
      }
      return Status.add(status)
        .then(result => h.response(result));
    },
    config: {
      validate: {
        payload: {
          startTime: Joi.string().isoDate(),
          endTime: Joi.string().isoDate(),
          deviceTypes: Joi.array().items(Joi.string()).required(),
          deviceSemVersion: Joi.string().regex(/^(([*>=<]{1,2}[0-9A-Za-z.-]*[\s]*)[\s|]*)+$/).required(),
          appSemVersion: Joi.string().regex(/^(([*>=<]{1,2}[0-9A-Za-z.-]*[\s]*)[\s|]*)+$/).required(),
          type: Joi.string().required(),
          url: Joi.string().uri().allow(''),
          title: Joi.string().required(),
          contents: Joi.string(),
          isActivated: Joi.boolean().required(),
        },
      },
    },
  },
  {
    method: 'PUT',
    path: `${config.statusApiPrefix}/{statusId}`,
    handler: async (request, h) => {
      const status = Object.assign({}, request.payload);
      let unset;
      if (!status.startTime && !status.endTime) {
        unset = { startTime: 1, endTime: 1 };
      } else {
        status.startTime = (status.startTime) ? new Date(Date.parse(status.startTime)) : undefined;
        status.endTime = (status.endTime) ? new Date(Date.parse(status.endTime)) : undefined;
      }

      return Status.update(request.params.statusId, status, unset)
        .then(result => h.response(result));
    },
    config: {
      validate: {
        params: {
          statusId: Joi.string().required(),
        },
        payload: {
          startTime: Joi.string().isoDate(),
          endTime: Joi.string().isoDate(),
          deviceTypes: Joi.array().items(Joi.string()).required(),
          deviceSemVersion: Joi.string().regex(/^(([*>=<]{1,2}[0-9A-Za-z.-]*[\s]*)[\s|]*)+$/).required(),
          appSemVersion: Joi.string().regex(/^(([*>=<]{1,2}[0-9A-Za-z.-]*[\s]*)[\s|]*)+$/).required(),
          type: Joi.string().required(),
          title: Joi.string().required(),
          url: Joi.string().uri().allow(''),
          contents: Joi.string(),
          isActivated: Joi.boolean().required(),
        },
      },
    },
  },
  {
    method: 'PUT',
    path: `${config.statusApiPrefix}/{statusId}/{action}`,
    handler: (request, h) => Status.update(
      request.params.statusId, { isActivated: request.params.action === 'activate' },
    ).then(result => h.response(result)),
    config: {
      validate: {
        params: {
          statusId: Joi.string().required(),
          action: Joi.string().valid('activate', 'deactivate').required(),
        },
      },
    },
  },
  {
    method: 'DELETE',
    path: `${config.statusApiPrefix}/{statusId}`,
    handler: (request, h) => Status.remove(request.params.statusId)
      .then(result => h.response(result)),
    config: {
      validate: {
        params: {
          statusId: Joi.string().required(),
        },
      },
    },
  },
];
