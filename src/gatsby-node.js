// Copyright © 2019 Province of British Columbia
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Created by Patrick Simonian on 2019-06-04.
//
import isString from 'lodash/isString';
import isFunction from 'lodash/isFunction';
import validUrl from 'valid-url';
import {
  areOptionsOkay,
  getManifestInFileSystem,
  manifestIsValid,
  createNodeObject,
} from './utils';
import { ERRORS } from './constants';
import { validateAndFilterManifest } from './utils/manifest';
import axios from 'axios';
import Metascraper from 'metascraper';
import metascrapeAuthor from 'metascraper-author';
import metascraperDate from 'metascraper-date';
import metascraperDescription from 'metascraper-description';
import metascraperImage from 'metascraper-image';
import metascraperLogo from 'metascraper-logo';
import metascraperClearbit from 'metascraper-clearbit';
import metascraperPublisher from 'metascraper-publisher';
import metascraperTitle from 'metascraper-title';
import metascraperUrl from 'metascraper-url';

const metascraper = Metascraper([
  metascrapeAuthor(),
  metascraperDate(),
  metascraperDescription(),
  metascraperImage(),
  metascraperLogo(),
  metascraperClearbit(),
  metascraperPublisher(),
  metascraperTitle(),
  metascraperUrl(),
]);

export const sourceNodes = async ({ getNodes, actions, createNodeId }, { urls }) => {
  const { createNode } = actions;
  if (!areOptionsOkay(urls, getNodes)) {
    throw new Error(ERRORS.BAD_OPTIONS);
  }

  let manifest = [];
  if (isString(urls)) {
    const manifestSourceType = urls;
    if (validUrl.isHttpsUri(urls)) {
      manifest = [{ url: urls }];
    } else {
      manifest = getManifestInFileSystem(getNodes, manifestSourceType);
    }
  } else if (isFunction(urls)) {
    manifest = urls(getNodes);
  } else {
    manifest = urls.map(url => {
      if (isString(url)) return { url };
      return url;
    });
  }

  if (!manifestIsValid(manifest)) {
    throw new Error(ERRORS.BAD_MANIFEST);
  }

  // validate files and filter
  const filteredManifest = validateAndFilterManifest(manifest);

  // grab seperate urls from the rest of the metadata
  const urlMap = filteredManifest.reduce((map, currentUrlObj) => {
    const { url, ...rest } = currentUrlObj;
    // setting to lower to prevent and case mispellings that could happen from
    // a malformed url
    map.set(url.toLowerCase(), { url, metadata: rest });
    return map;
  }, new Map());

  const fetchUrlList = Array.from(urlMap.entries());

  const sites = await Promise.all(fetchUrlList.map(entry => axios.get(entry[1].url)));

  const metascrapedSites = sites.map(async response => {
    const html = response.data;
    return await metascraper({ html, url: response.config.url });
  });

  const parsed = await Promise.all(metascrapedSites);

  parsed.forEach(data => {
    const metadata = urlMap.get(data.url.toLowerCase()).metadata;
    createNode(createNodeObject(createNodeId, data, metadata));
  });
};
