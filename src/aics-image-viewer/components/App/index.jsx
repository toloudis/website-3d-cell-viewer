// 3rd Party Imports
import { Layout, Progress } from "antd";
import React from "react";
import { includes, isEqual, filter, find, map } from "lodash";
import { RENDERMODE_PATHTRACE, RENDERMODE_RAYMARCH, Volume, VolumeLoader } from "@aics/volume-viewer";

import { controlPointsToLut } from "../../shared/utils/controlPointsToLut";
import HttpClient from "../../shared/utils/httpClient";
import enums from "../../shared/enums";
import {
  CELL_SEGMENTATION_CHANNEL_NAME,
  OTHER_CHANNEL_KEY,
  PRESET_COLORS_0,
  ALPHA_MASK_SLIDER_3D_DEFAULT,
  ALPHA_MASK_SLIDER_2D_DEFAULT,
  SEGMENTED_CELL,
  VOLUME_ENABLED,
  LUT_CONTROL_POINTS,
  COLORIZE_ALPHA,
  ISO_SURFACE_ENABLED,
  ALPHA_MASK_SLIDER_LEVEL,
  FULL_FIELD_IMAGE,
  BRIGHTNESS_SLIDER_LEVEL,
  DENSITY_SLIDER_LEVEL,
  LEVELS_SLIDER,
  BRIGHTNESS_SLIDER_LEVEL_DEFAULT,
  DENSITY_SLIDER_LEVEL_DEFAULT,
  LEVELS_SLIDER_DEFAULT,
  ISO_VALUE,
  OPACITY,
  COLOR,
  SAVE_ISO_SURFACE,
  MODE,
  AUTO_ROTATE,
  MAX_PROJECT,
  PATH_TRACE,
  LUT_MIN_PERCENTILE,
  LUT_MAX_PERCENTILE,
  COLORIZE_ENABLED,
  SINGLE_GROUP_CHANNEL_KEY,
} from "../../shared/constants";

import ControlPanel from "../ControlPanel";
import CellViewerCanvasWrapper from "../CellViewerCanvasWrapper";
import { TFEDITOR_DEFAULT_COLOR } from "../TfEditor";

import "../../assets/styles/globals.scss";
import {
  gammaSliderToImageValues,
  densitySliderToImageValue,
  brightnessSliderToImageValue,
  alphaSliderToImageValue,
} from "../../shared/utils/sliderValuesToImageValues";

import "./styles.scss";

const ViewMode = enums.viewMode.mainMapping;
const { Sider, Content } = Layout;

const OK_STATUS = "OK";
const ERROR_STATUS = "Error";
const INIT_COLORS = PRESET_COLORS_0;
const CHANNEL_SETTINGS = "channelSettings";

export default class App extends React.Component {
  constructor(props) {
    super(props);

    let viewmode = ViewMode.threeD;
    let pathtrace = false;
    let maxproject = false;
    if (props.viewerConfig) {
      if (props.viewerConfig.mode === "pathtrace") {
        pathtrace = true;
        maxproject = false;
      }
      else if (props.viewerConfig.mode === "maxprojection") {
        pathtrace = true;
        maxproject = false;
      }
      else {
        pathtrace = false;
        maxproject = false;
      }
      if (props.viewerConfig.view === "XY") {
        viewmode = ViewMode.xy;
      }
      else if (props.viewerConfig.view === "YZ") {
        viewmode = ViewMode.yz;
      }
      else if (props.viewerConfig.view === "XZ") {
        viewmode = ViewMode.xz;
      }
    }
        
    this.state = {
      image: null,
      view3d: null,
      files: null,
      cellId: props.cellId,
      fovPath: props.fovPath,
      cellPath: props.cellPath,
      queryErrorMessage: null,
      sendingQueryRequest: false,
      openFilesOnly: false,
      channelDataReady: {},
      // channelGroupedByType is an object where channel indexes are grouped by type (observed, segmenations, and countours)
      // {observed: channelIndex[], segmentations: channelIndex[], contours: channelIndex[], other: channelIndex[] }
      channelGroupedByType: {},
      // did the requested image have a cell id (in queryInput)?
      hasCellId: !!props.cellId,
      // state set by the UI:
      userSelections: {
        imageType: SEGMENTED_CELL,
        controlPanelClosed: false,
        [MODE]: viewmode,
        [AUTO_ROTATE]: false,
        [MAX_PROJECT]: maxproject,
        [PATH_TRACE]: pathtrace,
        [ALPHA_MASK_SLIDER_LEVEL]: [props.viewerConfig.maskAlpha] || ALPHA_MASK_SLIDER_3D_DEFAULT,
        [BRIGHTNESS_SLIDER_LEVEL]: [props.viewerConfig.brightness] || BRIGHTNESS_SLIDER_LEVEL_DEFAULT,
        [DENSITY_SLIDER_LEVEL]: [props.viewerConfig.density] || DENSITY_SLIDER_LEVEL_DEFAULT,
        [LEVELS_SLIDER]: props.viewerConfig.levels || LEVELS_SLIDER_DEFAULT,
        // channelSettings is a flat list of objects of this type:
        // { name, enabled, volumeEnabled, isosurfaceEnabled, isovalue, opacity, color, dataReady}
        [CHANNEL_SETTINGS]: [],
      },
    };

    this.openImage = this.openImage.bind(this);
    this.loadFromJson = this.loadFromJson.bind(this);
    this.loadFromRaw = this.loadFromRaw.bind(this);
    this.onChannelDataLoaded = this.onChannelDataLoaded.bind(this);

    this.onViewModeChange = this.onViewModeChange.bind(this);
    this.updateChannelTransferFunction = this.updateChannelTransferFunction.bind(this);
    this.onAutorotateChange = this.onAutorotateChange.bind(this);
    this.onSwitchFovCell = this.onSwitchFovCell.bind(this);
    this.handleOpenImageResponse = this.handleOpenImageResponse.bind(this);
    this.handleOpenImageException = this.handleOpenImageException.bind(this);
    this.toggleControlPanel = this.toggleControlPanel.bind(this);
    this.onUpdateImageMaskAlpha = this.onUpdateImageMaskAlpha.bind(this);
    this.setImageAxisClip = this.setImageAxisClip.bind(this);
    this.onApplyColorPresets = this.onApplyColorPresets.bind(this);
    this.getNumberOfSlices = this.getNumberOfSlices.bind(this);
    this.makeUpdatePixelSizeFn = this.makeUpdatePixelSizeFn.bind(this);
    this.setUserSelectionsInState = this.setUserSelectionsInState.bind(this);
    this.changeChannelSettings = this.changeChannelSettings.bind(this);
    this.changeOneChannelSetting = this.changeOneChannelSetting.bind(this);
    this.handleChangeUserSelection = this.handleChangeUserSelection.bind(this);
    this.handleChangeToImage = this.handleChangeToImage.bind(this);
    this.updateStateOnLoadImage = this.updateStateOnLoadImage.bind(this);
    this.intializeNewImage = this.intializeNewImage.bind(this);
    this.onView3DCreated = this.onView3DCreated.bind(this);
    this.createChannelGrouping = this.createChannelGrouping.bind(this);
    this.beginRequestImage = this.beginRequestImage.bind(this);
    this.loadNextImage = this.loadNextImage.bind(this);
    this.loadPrevImage = this.loadPrevImage.bind(this);
    this.getOneChannelSetting = this.getOneChannelSetting.bind(this);
    this.setInitialChannelConfig = this.setInitialChannelConfig.bind(this);
    this.nameClean = this.nameClean.bind(this);
    this.changeRenderingAlgorithm = this.changeRenderingAlgorithm.bind(this);
    document.addEventListener("keydown", this.handleKeydown, false);
  }

  componentDidMount() {
    const { cellId } = this.props;
    if (cellId) {
      this.beginRequestImage();
    }
  }

  componentDidUpdate(prevProps, prevState) {
    const { cellId, cellPath, rawDims, rawData } = this.props;
    const { userSelections, view3d, image } = this.state;

    if (rawDims && rawData && view3d && !prevState.view3d && !image) {
      this.loadFromRaw();
    }

    // delayed for the animation to finish
    if (prevState.userSelections.controlPanelClosed !== this.state.userSelections.controlPanelClosed) {
      setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 200);
    }
    const newRequest = cellId !== prevProps.cellId;
    if (newRequest) {
      if (cellPath === prevProps.nextImgPath) {
        this.loadNextImage();
      } else if (cellPath === prevProps.prevImgPath) {
        this.loadPrevImage();
      } else {
        this.beginRequestImage();
      }
    }
    const channelsChanged = !isEqual(userSelections[CHANNEL_SETTINGS], prevState.userSelections[CHANNEL_SETTINGS]);
    const newImage = this.state.image && !prevState.image;
    const imageChanged = this.state.image && prevState.image && this.state.image.name !== prevState.image.name;
    if (newImage || channelsChanged || imageChanged) {
      this.updateImageVolumeAndSurfacesEnabledFromAppState();
    }
  }

  onView3DCreated(view3d) {
    this.setState({ view3d });
  }

  setInitialChannelConfig(channelNames, channelColors) {
    const { defaultVolumesOn, defaultSurfacesOn, initialChannelSettings } = this.props;
    return channelNames.map((channel, index) => {
      let color = channelColors[index] ? channelColors[index].slice() : [226, 205, 179]; // guard for unexpectedly longer channel list
      const initSettings = initialChannelSettings[index];
      if (initSettings && initSettings.color) {
        // init color is a xxxxxx string. split it into array of rgb ints
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(initSettings.color);
        if (result) {
          color = [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
        }
      }

      return {
        name: this.nameClean(channel) || "Channel " + index,
        [VOLUME_ENABLED]: includes(defaultVolumesOn, index),
        [ISO_SURFACE_ENABLED]: includes(defaultSurfacesOn, index),
        [COLORIZE_ENABLED]: false,
        [COLORIZE_ALPHA]: 1.0,
        isovalue: 188,
        opacity: 1.0,
        color: color,
        dataReady: false,
      };
    });
  }

  // PROP for standardizing channel names.
  // Ie if you want both segmentation and raw of the same protein to have the same UI settings.
  nameClean(channelName) {
    const { channelNameClean } = this.props;
    if (channelNameClean) {
      return channelNameClean(channelName);
    }
    return channelName;
  }

  createChannelGrouping(channels) {
    const { groupToChannelNameMap } = this.props;
    if (channels) {
      const keyList = Object.keys(groupToChannelNameMap);
      const initialChannelAcc = {};
      for (const k of keyList) {
        initialChannelAcc[k] = [];
      }
      // if there are no groupings specified then just use SINGLE_GROUP_CHANNEL_KEY
      const remainderGroupName = keyList.length === 0 ? SINGLE_GROUP_CHANNEL_KEY : OTHER_CHANNEL_KEY;
      const grouping = channels.reduce((acc, channel, index) => {
        let other = true;
        keyList.forEach((key) => {
          if (includes(groupToChannelNameMap[key], channel)) {
            if (!includes(acc[key], index)) {
              acc[key].push(index);
            }
            other = false;
          }
        });
        if (other) {
          if (!acc[remainderGroupName]) {
            acc[remainderGroupName] = [];
          }
          if (!includes(acc[remainderGroupName], index)) {
            acc[remainderGroupName].push(index);
          }
        }
        return acc;
      }, initialChannelAcc);
      return grouping;
    }
    return {};
  }

  stopPollingForImage() {
    if (this.openImageInterval) {
      clearInterval(this.openImageInterval);
      this.openImageInterval = null;
    }
  }

  checkDimensionsMatch(a, b) {
    return (
      a.width === b.width ||
      a.height === b.height ||
      a.rows === b.rows ||
      a.cols === b.cols ||
      a.tiles === b.tiles ||
      a.tile_width === b.tile_width ||
      a.tile_height === b.tile_height ||
      a.atlas_width === b.atlas_width ||
      a.atlas_height === b.atlas_height
    );
  }

  handleOpenImageResponse(resp, queryType, imageDirectory, doResetViewMode, stateKey, keepLuts) {
    if (resp.data.status === OK_STATUS) {
      if (this.stateKey === "image") {
        this.setState({
          currentlyLoadedImagePath: imageDirectory,
          channelDataReady: {},
          queryErrorMessage: null,
          cachingInProgress: false,
          mode: doResetViewMode ? ViewMode.threeD : this.state.userSelections.mode,
        });
      }
      this.loadFromJson(resp.data, resp.data.name, resp.locationHeader, stateKey, keepLuts);
      this.stopPollingForImage();
    } else if (resp.data.status === ERROR_STATUS) {
      this.stopPollingForImage();
    } else {
      this.setState({
        cachingInProgress: true,
      });
    }
  }

  handleOpenImageException(resp) {
    /** can uncomment when we are actually using this message var
    let message = "Unknown Error";
    if (resp.data && resp.data.message) {
      message = resp.data.message;
    }
    else if (resp.stack) {
      message = resp.stack;
    }
    else if (resp.message) {
      message = resp.message;
    }
    else {
      message = JSON.stringify(resp);
    }
    **/
    // console.log(message);
    this.stopPollingForImage();
  }

  openImage(imageDirectory, doResetViewMode, stateKey, keepLuts) {
    if (imageDirectory === this.state.currentlyLoadedImagePath) {
      return;
    }
    const { baseUrl } = this.props;

    const toLoad = baseUrl ? `${baseUrl}/${imageDirectory}_atlas.json` : `${imageDirectory}'_atlas.json`;
    //const toLoad = BASE_URL + 'AICS-10/AICS-10_5_5_atlas.json';
    // retrieve the json file directly from its url
    new HttpClient()
      .getJSON(toLoad, { mode: "cors" })
      .then((resp) => {
        // set up some stuff that the backend caching service was doing for us, to spoof the rest of the code
        resp.data.status = OK_STATUS;
        resp.locationHeader = toLoad.substring(0, toLoad.lastIndexOf("/") + 1);
        return this.handleOpenImageResponse(resp, 0, imageDirectory, doResetViewMode, stateKey, keepLuts);
      })
      .catch((resp) => this.handleOpenImageException(resp));
  }

  intializeNewImage(aimg, newChannelSettings) {
    const { userSelections, view3d } = this.state;
    const { filterFunc, viewerConfig } = this.props;
    const channelSetting = newChannelSettings || userSelections[CHANNEL_SETTINGS];
    let alphaLevel =
      userSelections.imageType === SEGMENTED_CELL && userSelections.mode === ViewMode.threeD
        ? ALPHA_MASK_SLIDER_3D_DEFAULT
        : ALPHA_MASK_SLIDER_2D_DEFAULT;
    // if maskAlpha is defined in viewerConfig then it will override the above
    if (viewerConfig.maskAlpha !== undefined) {
      alphaLevel = [viewerConfig.maskAlpha];
    }

    let imageMask = alphaSliderToImageValue(alphaLevel);
    let imageBrightness = brightnessSliderToImageValue(
      userSelections[BRIGHTNESS_SLIDER_LEVEL],
      userSelections[PATH_TRACE]
    );
    let imageDensity = densitySliderToImageValue(userSelections[DENSITY_SLIDER_LEVEL], userSelections[PATH_TRACE]);
    let imageValues = gammaSliderToImageValues(userSelections[LEVELS_SLIDER]);
    // set alpha slider first time image is loaded to something that makes sense
    this.setUserSelectionsInState({ [ALPHA_MASK_SLIDER_LEVEL]: alphaLevel });

    // Here is where we officially hand the image to the volume-viewer

    view3d.removeAllVolumes();
    view3d.addVolume(aimg, {
      channels: aimg.channel_names.map((name) => {
        const ch = this.getOneChannelSetting(name, channelSetting);
        if (!ch) {
          return {};
        }
        if (filterFunc && !filterFunc(name)) {
          return {
            enabled: false,
            isosurfaceEnabled: false,
            isovalue: ch.isovalue,
            isosurfaceOpacity: ch.opacity,
            color: ch.color,
          };
        }

        return {
          enabled: ch[VOLUME_ENABLED],
          isosurfaceEnabled: ch[ISO_SURFACE_ENABLED],
          isovalue: ch.isovalue,
          isosurfaceOpacity: ch.opacity,
          color: ch.color,
        };
      }),
    });

    view3d.updateMaskAlpha(aimg, imageMask);
    view3d.setMaxProjectMode(aimg, userSelections[MAX_PROJECT]);
    view3d.updateExposure(imageBrightness);
    view3d.updateDensity(aimg, imageDensity);
    view3d.setGamma(aimg, imageValues.min, imageValues.scale, imageValues.max);
    // update current camera mode to make sure the image gets the update
    view3d.setCameraMode(enums.viewMode.VIEW_MODE_ENUM_TO_LABEL_MAP.get(userSelections.mode));
    // tell view that things have changed for this image
    view3d.updateActiveChannels(aimg);
  }

  updateStateOnLoadImage(channelNames) {
    const { userSelections } = this.state;
    const { filterFunc } = this.props;

    const cleanNewNames = map(channelNames, this.nameClean);
    const filteredNewChannelNames = filterFunc ? filter(cleanNewNames, filterFunc) : cleanNewNames;
    const prevChannelNames = map(userSelections[CHANNEL_SETTINGS], (ele) => this.nameClean(ele.name));
    let newChannelSettings = isEqual(prevChannelNames, filteredNewChannelNames)
      ? userSelections[CHANNEL_SETTINGS]
      : this.setInitialChannelConfig(filteredNewChannelNames, INIT_COLORS, filterFunc);

    let channelGroupedByType = this.createChannelGrouping(channelNames);
    this.setUserSelectionsInState({
      [CHANNEL_SETTINGS]: newChannelSettings,
    });
    this.setState({
      channelGroupedByType,
    });
    return newChannelSettings;
  }

  onChannelDataLoaded(aimg, thisChannelsSettings, channelIndex, keepLuts) {
    const { image, view3d } = this.state;
    if (aimg !== image) {
      return;
    }
    const volenabled = thisChannelsSettings[VOLUME_ENABLED];
    const isoenabled = thisChannelsSettings[ISO_SURFACE_ENABLED];
    view3d.setVolumeChannelOptions(aimg, channelIndex, {
      enabled: volenabled,
      color: thisChannelsSettings.color,
      isosurfaceEnabled: isoenabled,
      isovalue: thisChannelsSettings.isovalue,
      isosurfaceOpacity: thisChannelsSettings.opacity,
    });

    // if we want to keep the current control points
    if (thisChannelsSettings[LUT_CONTROL_POINTS] && keepLuts) {
      const lut = controlPointsToLut(thisChannelsSettings[LUT_CONTROL_POINTS]);
      aimg.setLut(channelIndex, lut);
      view3d.updateLuts(aimg);
    } else {
      // need to choose initial LUT

      const histogram = aimg.getHistogram(channelIndex);

      const initSettings = this.props.initialChannelSettings[channelIndex];
      let lutObject = {};
      if (initSettings && initSettings.lutMin !== undefined && initSettings.lutMax !== undefined) {
        lutObject = histogram.lutGenerator_minMax(initSettings.lutMin, initSettings.lutMax);
      } else {
        lutObject = histogram.lutGenerator_percentiles(LUT_MIN_PERCENTILE, LUT_MAX_PERCENTILE);
      }

      const newControlPoints = lutObject.controlPoints.map((controlPoint) => ({
        ...controlPoint,
        color: TFEDITOR_DEFAULT_COLOR,
      }));
      aimg.setLut(channelIndex, lutObject.lut);
      this.changeOneChannelSetting(thisChannelsSettings.name, channelIndex, LUT_CONTROL_POINTS, newControlPoints);
    }

    if (view3d) {
      if (aimg.channelNames()[channelIndex] === CELL_SEGMENTATION_CHANNEL_NAME) {
        view3d.setVolumeChannelAsMask(aimg, channelIndex);
      }
    }

    // when any channel data has arrived:
    if (this.state.sendingQueryRequest) {
      this.setState({ sendingQueryRequest: false });
    }
    if (aimg.loaded) {
      view3d.updateActiveChannels(aimg);
    }
  }

  loadPrevImage() {
    const { image, prevImg } = this.state;
    const { prevImgPath } = this.props;

    // assume prevImg is available to initialize
    this.intializeNewImage(prevImg);
    this.setState({
      image: prevImg,
      nextImg: image,
    });
    // preload the new "prevImg"
    this.openImage(prevImgPath, true, "prevImg");
  }

  loadNextImage() {
    const { image, nextImg } = this.state;
    const { nextImgPath } = this.props;

    // assume nextImg is available to initialize
    this.intializeNewImage(nextImg);
    this.setState({
      image: nextImg,
      prevImg: image,
    });
    // preload the new "nextImg"
    this.openImage(nextImgPath, true, "nextImg");
  }

  loadFromJson(obj, title, locationHeader, stateKey, keepLuts) {
    const aimg = new Volume(obj);

    const newChannelSettings = this.updateStateOnLoadImage(obj.channel_names);
    // if we have some url to prepend to the atlas file names, do it now.
    if (locationHeader) {
      obj.images = obj.images.map((img) => ({
        ...img,
        name: `${locationHeader}${img.name}`,
      }));
    }
    // GO OUT AND GET THE VOLUME DATA.
    VolumeLoader.loadVolumeAtlasData(aimg, obj.images, (url, channelIndex) => {
      // const thisChannelSettings = this.getOneChannelSetting(channel.name, newChannelSettings, (channel) => channel.name === obj.channel_names[channelIndex].split('_')[0]);
      const thisChannelSettings = this.getOneChannelSetting(obj.channel_names[channelIndex], newChannelSettings);
      this.onChannelDataLoaded(aimg, thisChannelSettings, channelIndex, keepLuts);
    });
    if (stateKey === "image") {
      this.intializeNewImage(aimg, newChannelSettings);
    }
    this.setState({ [stateKey]: aimg });
  }

  loadFromRaw() {
    const { rawDims, rawData } = this.props;

    const aimg = new Volume(rawDims);
    const volsize = rawData.shape[1] * rawData.shape[2] * rawData.shape[3];
    for (var i = 0; i < rawDims.channels; ++i) {
      aimg.setChannelDataFromVolume(i, new Uint8Array(rawData.buffer.buffer, i * volsize, volsize));
    }

    const cleanNewNames = map(rawDims.channel_names, this.nameClean);
    const filteredNewChannelNames = cleanNewNames;
    const { defaultVolumesOn, defaultSurfacesOn, initialChannelSettings } = this.props;
    let newChannelSettings = filteredNewChannelNames.map((channel, index) => {
      const lutObject = aimg.getHistogram(index).lutGenerator_percentiles(LUT_MIN_PERCENTILE, LUT_MAX_PERCENTILE);
      const newControlPoints = lutObject.controlPoints.map((controlPoint) => ({
        ...controlPoint,
        color: TFEDITOR_DEFAULT_COLOR,
      }));
      aimg.setLut(index, lutObject.lut);

      let color = INIT_COLORS[index] ? INIT_COLORS[index].slice() : [226, 205, 179]; // guard for unexpectedly longer channel list
      const initSettings = initialChannelSettings[index];
      if (initSettings && initSettings.color) {
        // init color is a xxxxxx string. split it into array of rgb ints
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(initSettings.color);
        if (result) {
          color = [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
        }
      }

      return {
        name: this.nameClean(channel) || "Channel " + index,
        [VOLUME_ENABLED]: includes(defaultVolumesOn, index),
        [ISO_SURFACE_ENABLED]: includes(defaultSurfacesOn, index),
        [LUT_CONTROL_POINTS]: newControlPoints,
        [COLORIZE_ENABLED]: false,
        [COLORIZE_ALPHA]: 1.0,
        isovalue: 188,
        opacity: 1.0,
        color: color,
        dataReady: false,
      };
    });

    let channelGroupedByType = this.createChannelGrouping(rawDims.channel_names);

    const { userSelections, view3d } = this.state;
    const { filterFunc } = this.props;
    const channelSetting = newChannelSettings;
    let alphaLevel =
      userSelections.imageType === SEGMENTED_CELL && userSelections.mode === ViewMode.threeD
        ? ALPHA_MASK_SLIDER_3D_DEFAULT
        : ALPHA_MASK_SLIDER_2D_DEFAULT;

    let imageMask = alphaSliderToImageValue(alphaLevel);
    let imageBrightness = brightnessSliderToImageValue(
      userSelections[BRIGHTNESS_SLIDER_LEVEL],
      userSelections[PATH_TRACE]
    );
    let imageDensity = densitySliderToImageValue(userSelections[DENSITY_SLIDER_LEVEL], userSelections[PATH_TRACE]);
    let imageValues = gammaSliderToImageValues(userSelections[LEVELS_SLIDER]);

    // Here is where we officially hand the image to the volume-viewer

    view3d.removeAllVolumes();
    view3d.addVolume(aimg, {
      channels: aimg.channel_names.map((name) => {
        const ch = find(channelSetting, (channel) => {
          return channel.name === this.nameClean(name);
        });

        if (!ch) {
          return {};
        }
        if (filterFunc && !filterFunc(name)) {
          return {
            enabled: false,
            isosurfaceEnabled: false,
            isovalue: ch.isovalue,
            isosurfaceOpacity: ch.opacity,
            color: ch.color,
          };
        }

        return {
          enabled: ch[VOLUME_ENABLED],
          isosurfaceEnabled: ch[ISO_SURFACE_ENABLED],
          isovalue: ch.isovalue,
          isosurfaceOpacity: ch.opacity,
          color: ch.color,
        };
      }),
    });

    view3d.updateMaskAlpha(aimg, imageMask);
    view3d.setMaxProjectMode(aimg, userSelections[MAX_PROJECT]);
    view3d.updateExposure(imageBrightness);
    view3d.updateDensity(aimg, imageDensity);
    view3d.setGamma(aimg, imageValues.min, imageValues.scale, imageValues.max);
    // update current camera mode to make sure the image gets the update
    view3d.setCameraMode(enums.viewMode.VIEW_MODE_ENUM_TO_LABEL_MAP.get(userSelections.mode));
    // tell view that things have changed for this image
    view3d.updateActiveChannels(aimg);

    this.setState({
      channelGroupedByType,
      image: aimg,
      userSelections: {
        ...this.state.userSelections,
        [ALPHA_MASK_SLIDER_LEVEL]: alphaLevel,
        [CHANNEL_SETTINGS]: channelSetting,
      },
    });
  }

  handleChangeUserSelection(key, newValue) {
    this.setUserSelectionsInState({ [key]: newValue });
    this.handleChangeToImage(key, newValue);
  }

  changeOneChannelSetting(channelName, channelIndex, keyToChange, newValue) {
    const { userSelections } = this.state;
    const newChannels = userSelections[CHANNEL_SETTINGS].map((channel, index) => {
      return channel.name === channelName ? { ...channel, [keyToChange]: newValue } : channel;
    });

    this.setUserSelectionsInState({ [CHANNEL_SETTINGS]: newChannels });
    this.handleChangeToImage(keyToChange, newValue, channelIndex);
  }

  changeChannelSettings(indices, keyToChange, newValue) {
    const { userSelections } = this.state;
    const newChannels = userSelections[CHANNEL_SETTINGS].map((channel, index) => {
      return {
        ...channel,
        [keyToChange]: includes(indices, index) ? newValue : channel[keyToChange],
      };
    });
    this.setUserSelectionsInState({ [CHANNEL_SETTINGS]: newChannels });
  }

  setUserSelectionsInState(newState) {
    this.setState({
      userSelections: {
        ...this.state.userSelections,
        ...newState,
      },
    });
  }

  handleChangeToImage(keyToChange, newValue, index) {
    const { image, userSelections, view3d } = this.state;
    if (!image || !view3d) {
      return;
    }
    switch (keyToChange) {
      case ISO_VALUE:
        view3d.setVolumeChannelOptions(image, index, {
          isovalue: newValue,
        });
        break;
      case OPACITY:
        view3d.setVolumeChannelOptions(image, index, {
          isosurfaceOpacity: newValue,
        });
        break;
      case COLOR:
        {
          let newColor = newValue.r ? [newValue.r, newValue.g, newValue.b, newValue.a] : newValue;
          view3d.setVolumeChannelOptions(image, index, {
            color: newColor,
          });
          view3d.updateMaterial(image);
        }
        break;
      case MODE:
        view3d.setCameraMode(enums.viewMode.VIEW_MODE_ENUM_TO_LABEL_MAP.get(newValue));
        break;
      case SAVE_ISO_SURFACE:
        view3d.saveChannelIsosurface(image, index, newValue);
        break;
      case COLORIZE_ENABLED:
        if (newValue) {
          // TODO get the labelColors from the tf editor component
          const lut = image.getHistogram(index).lutGenerator_labelColors();
          image.setColorPalette(index, lut.lut);
          image.setColorPaletteAlpha(index, userSelections[CHANNEL_SETTINGS][index][COLORIZE_ALPHA]);
        } else {
          image.setColorPaletteAlpha(index, 0);
        }
        view3d.updateLuts(image);
        break;
      case COLORIZE_ALPHA:
        if (userSelections[CHANNEL_SETTINGS][index][COLORIZE_ENABLED]) {
          image.setColorPaletteAlpha(index, newValue);
        } else {
          image.setColorPaletteAlpha(index, 0);
        }
        view3d.updateLuts(image);
        break;
      case MAX_PROJECT:
        view3d.setMaxProjectMode(image, newValue ? true : false);
        view3d.updateActiveChannels(image);
        break;
      case PATH_TRACE:
        view3d.setVolumeRenderMode(newValue ? RENDERMODE_PATHTRACE : RENDERMODE_RAYMARCH);
        view3d.updateActiveChannels(image);
        break;
      case ALPHA_MASK_SLIDER_LEVEL:
        {
          let imageMask = alphaSliderToImageValue(newValue);
          view3d.updateMaskAlpha(image, imageMask);
          view3d.updateActiveChannels(image);
        }
        break;
      case BRIGHTNESS_SLIDER_LEVEL:
        {
          let imageBrightness = brightnessSliderToImageValue(newValue, userSelections[PATH_TRACE]);
          view3d.updateExposure(imageBrightness);
        }
        break;
      case DENSITY_SLIDER_LEVEL:
        {
          let imageDensity = densitySliderToImageValue(newValue, userSelections[PATH_TRACE]);
          view3d.updateDensity(image, imageDensity);
        }
        break;
      case LEVELS_SLIDER:
        {
          let imageValues = gammaSliderToImageValues(newValue);
          view3d.setGamma(image, imageValues.min, imageValues.scale, imageValues.max);
        }
        break;
    }
  }

  onViewModeChange(newMode) {
    const { userSelections } = this.state;
    let newSelectionState = {
      [MODE]: newMode,
    };
    // if switching between 2D and 3D reset alpha mask to default (off in in 2D, 50% in 3D)
    // if full field, dont mask
    if (userSelections.mode === ViewMode.threeD && newMode !== ViewMode.threeD) {
      // Switching to 2d
      newSelectionState = {
        [MODE]: newMode,
        [PATH_TRACE]: false,
        [ALPHA_MASK_SLIDER_LEVEL]: ALPHA_MASK_SLIDER_2D_DEFAULT,
      };
      // if path trace was enabled in 3D turn it off when switching to 2D.
      if (userSelections[PATH_TRACE]) {
        this.changeRenderingAlgorithm("volume");
      }
      // switching from 2D to 3D
    } else if (
      userSelections.mode !== ViewMode.threeD &&
      newMode === ViewMode.threeD &&
      this.state.userSelections.imageType === SEGMENTED_CELL
    ) {
      // switching to 3d
      newSelectionState = {
        [MODE]: newMode,
        [ALPHA_MASK_SLIDER_LEVEL]: ALPHA_MASK_SLIDER_3D_DEFAULT,
      };
    }

    this.handleChangeToImage(MODE, newMode);
    if (newSelectionState[ALPHA_MASK_SLIDER_LEVEL]) {
      this.handleChangeToImage(ALPHA_MASK_SLIDER_LEVEL, newSelectionState[ALPHA_MASK_SLIDER_LEVEL]);
    }
    this.setUserSelectionsInState(newSelectionState);
  }

  onUpdateImageMaskAlpha(sliderValue) {
    this.setUserSelectionsInState({ [ALPHA_MASK_SLIDER_LEVEL]: sliderValue });
  }

  onAutorotateChange() {
    this.setUserSelectionsInState({
      [AUTO_ROTATE]: !this.state.userSelections[AUTO_ROTATE],
    });
  }

  setImageAxisClip(axis, minval, maxval, isOrthoAxis) {
    if (this.state.view3d && this.state.image) {
      this.state.view3d.setAxisClip(this.state.image, axis, minval, maxval, isOrthoAxis);
    }
  }

  makeUpdatePixelSizeFn(i) {
    const { pixelSize } = this.props;
    const imagePixelSize = pixelSize ? pixelSize.slice() : [1, 1, 1];
    return (value) => {
      const pixelSize = imagePixelSize.slice();
      pixelSize[i] = value;
      this.state.image.setVoxelSize(pixelSize);
    };
  }

  changeRenderingAlgorithm(newAlgorithm) {
    const { userSelections } = this.state;
    // already set
    if (userSelections[newAlgorithm]) {
      return;
    }
    this.setUserSelectionsInState({
      [PATH_TRACE]: newAlgorithm === PATH_TRACE,
      [MAX_PROJECT]: newAlgorithm === MAX_PROJECT,
    });
    this.handleChangeToImage(PATH_TRACE, newAlgorithm === PATH_TRACE);
    this.handleChangeToImage(MAX_PROJECT, newAlgorithm === MAX_PROJECT);
  }

  onSwitchFovCell(value) {
    const { cellPath, fovPath } = this.props;
    const path = value === FULL_FIELD_IMAGE ? fovPath : cellPath;
    this.openImage(path, false, "image", false);
    this.setState({
      sendingQueryRequest: true,
      userSelections: {
        ...this.state.userSelections,
        imageType: value,
      },
    });
  }

  onApplyColorPresets(presets) {
    const { userSelections } = this.state;
    presets.forEach((color, index) => {
      if (index < userSelections[CHANNEL_SETTINGS].length) {
        this.handleChangeToImage(COLOR, color, index);
      }
    });
    const newChannels = userSelections[CHANNEL_SETTINGS].map((channel, channelindex) => {
      return presets[channelindex] ? { ...channel, color: presets[channelindex] } : channel;
    });
    this.setUserSelectionsInState({ [CHANNEL_SETTINGS]: newChannels });
  }

  updateChannelTransferFunction(index, lut) {
    if (this.state.image) {
      this.state.image.setLut(index, lut);
      if (this.state.view3d) {
        this.state.view3d.updateLuts(this.state.image);
      }
    }
  }

  beginRequestImage(type) {
    const { fovPath, cellPath, cellId, prevImgPath, nextImgPath, preLoad } = this.props;
    let imageType = type || this.state.userSelections.imageType;
    let path;
    if (imageType === FULL_FIELD_IMAGE) {
      path = fovPath;
    } else if (imageType === SEGMENTED_CELL) {
      path = cellPath;
    }
    this.setState({
      cellId,
      path,
      hasCellId: !!cellId,
      sendingQueryRequest: true,
      userSelections: {
        ...this.state.userSelections,
        imageType,
      },
    });
    if (preLoad) {
      this.openImage(nextImgPath, true, "nextImg", true);
      this.openImage(prevImgPath, true, "prevImg", true);
    }
    this.openImage(path, true, "image");
  }

  getOneChannelSetting(channelName, newSettings) {
    const { userSelections } = this.state;
    const channelSettings = newSettings || userSelections[CHANNEL_SETTINGS];
    return find(channelSettings, (channel) => {
      return channel.name === this.nameClean(channelName);
    });
  }

  updateImageVolumeAndSurfacesEnabledFromAppState() {
    const { image, view3d } = this.state;
    // apply channel settings
    // image.channel_names
    if (!image) {
      return;
    }
    image.channel_names.forEach((channelName, imageIndex) => {
      if (image.getChannel(imageIndex).loaded) {
        const channelSetting = this.getOneChannelSetting(channelName);
        if (!channelSetting) {
          return;
        }
        const volenabled = channelSetting[VOLUME_ENABLED];
        const isoenabled = channelSetting[ISO_SURFACE_ENABLED];

        view3d.setVolumeChannelOptions(image, imageIndex, {
          enabled: volenabled,
          color: channelSetting.color,
          isosurfaceEnabled: isoenabled,
          isovalue: channelSetting.isovalue,
          isosurfaceOpacity: channelSetting.opacity,
        });
      }
    });

    view3d.updateActiveChannels(image);
  }

  toggleControlPanel(value) {
    this.setState({
      userSelections: {
        ...this.state.userSelections,
        controlPanelClosed: value,
      },
    });
  }

  getNumberOfSlices() {
    if (this.state.image) {
      return {
        x: this.state.image.x,
        y: this.state.image.y,
        z: this.state.image.z,
      };
    }
    return {};
  }

  render() {
    const { userSelections } = this.state;
    const { renderConfig, cellDownloadHref, channelNameMapping, fovDownloadHref } = this.props;
    return (
      <Layout className="cell-viewer-app" style={{ height: this.props.appHeight }}>
        <Sider
          className="control-panel-holder"
          collapsible={true}
          defaultCollapsed={false}
          collapsedWidth={0}
          collapsed={this.state.userSelections.controlPanelClosed}
          onCollapse={this.toggleControlPanel}
          width={450}
        >
          <ControlPanel
            renderConfig={renderConfig}
            // viewer capabilities
            canPathTrace={this.state.view3d ? this.state.view3d.canvas3d.hasWebGL2 : false}
            // image state
            imageName={this.state.image ? this.state.image.name : false}
            hasImage={!!this.state.image}
            pixelSize={this.state.image ? this.state.image.pixel_size : [1, 1, 1]}
            channelDataChannels={this.state.image ? this.state.image.channels : null}
            channelGroupedByType={this.state.channelGroupedByType}
            hasCellId={this.state.hasCellId}
            hasParentImage={!!this.state.fovPath}
            channelDataReady={this.state.channelDataReady}
            fovDownloadHref={fovDownloadHref}
            cellDownloadHref={cellDownloadHref}
            // user selections
            maxProjectOn={userSelections[MAX_PROJECT]}
            pathTraceOn={userSelections[PATH_TRACE]}
            renderSetting={
              userSelections[MAX_PROJECT] ? MAX_PROJECT : userSelections[PATH_TRACE] ? PATH_TRACE : "volume"
            }
            channelSettings={userSelections[CHANNEL_SETTINGS]}
            mode={userSelections[MODE]}
            imageType={userSelections.imageType}
            autorotate={userSelections[AUTO_ROTATE]}
            alphaMaskSliderLevel={userSelections[ALPHA_MASK_SLIDER_LEVEL]}
            brightnessSliderLevel={userSelections[BRIGHTNESS_SLIDER_LEVEL]}
            densitySliderLevel={userSelections[DENSITY_SLIDER_LEVEL]}
            gammaSliderLevel={userSelections[LEVELS_SLIDER]}
            // functions
            handleChangeUserSelection={this.handleChangeUserSelection}
            handleChangeToImage={this.handleChangeToImage}
            updateChannelTransferFunction={this.updateChannelTransferFunction}
            onViewModeChange={this.onViewModeChange}
            onColorChangeComplete={this.onColorChangeComplete}
            onAutorotateChange={this.onAutorotateChange}
            onSwitchFovCell={this.onSwitchFovCell}
            setImageAxisClip={this.setImageAxisClip}
            onApplyColorPresets={this.onApplyColorPresets}
            makeUpdatePixelSizeFn={this.makeUpdatePixelSizeFn}
            changeChannelSettings={this.changeChannelSettings}
            changeOneChannelSetting={this.changeOneChannelSetting}
            filterFunc={this.props.filterFunc}
            nameClean={this.nameClean}
            changeRenderingAlgorithm={this.changeRenderingAlgorithm}
            channelNameMapping={channelNameMapping}
          />
        </Sider>
        <Layout className="cell-viewer-wrapper">
          <Content>
            <Progress
              strokeColor={userSelections[PATH_TRACE] ? "#313131" : "#000"}
              // TODO: place holder for when we actually have an end point for path tracing. Now it's just a animated bar
              percent={99.9}
              status={userSelections[PATH_TRACE] ? "active" : "normal"}
              strokeLinecap="square"
              showInfo={false}
            />
            <CellViewerCanvasWrapper
              image={this.state.image}
              onAutorotateChange={this.onAutorotateChange}
              setAxisClip={this.setImageAxisClip}
              mode={userSelections.mode}
              autorotate={userSelections[AUTO_ROTATE]}
              loadingImage={this.state.sendingQueryRequest}
              numSlices={this.getNumberOfSlices()}
              onView3DCreated={this.onView3DCreated}
              appHeight={this.props.appHeight}
              renderConfig={renderConfig}
              pathTraceOn={userSelections[PATH_TRACE]}
            />
          </Content>
        </Layout>
      </Layout>
    );
  }

  componentWillUnmount() {
    document.removeEventListener("keydown", this.handleKeydown, false);
  }
}

App.defaultProps = {
  // rawData has a "dtype" which is expected to be "uint8", a "shape":[c,z,y,x] and a "buffer" which is a DataView
  rawData: null,
  // rawDims is the volume dims that normally come from a json file (see handleOpenImageResponse)
  rawDims: null,
  // list of channel indices
  defaultSurfacesOn: [1],
  // list of channel indices
  defaultVolumesOn: [],
  // map of index:{color, lutMin, lutMax}
  initialChannelSettings: {},
  // collection of {group name : array of channel names that fit under group}
  groupToChannelNameMap: {},
  // see nameClean function
  channelNameClean: null,
  // allows you to rename channels
  channelNameMapping: [],
  // allows you to completely ignore channels by name
  filterFunc: null,
  IMAGE_VIEWER_SERVICE_URL: "//allen/aics/animated-cell/Allen-Cell-Explorer/Allen-Cell-Explorer_1.4.0",
  DOWNLOAD_SERVER: "http://dev-aics-dtp-001/cellviewer-1-4-0/Cell-Viewer_Data/",
  IMAGE_SERVER: "http://dev-aics-dtp-001/cellviewer-1-4-0/Cell-Viewer_Thumbnails/",
  appHeight: "100vh",
  cellPath: "",
  fovPath: "",
  renderConfig: {
    alphaMask: true,
    autoRotateButton: true,
    axisClipSliders: true,
    brightnessSlider: true,
    colorPicker: true,
    colorPresetsDropdown: true,
    densitySlider: true,
    levelsSliders: true,
    saveSurfaceButtons: true,
    fovCellSwitchControls: true,
    viewModeRadioButtons: true,
  },
  viewerConfig: {
    view: "3D", // "XY", "XZ", "YZ"
    mode: "default", // "pathtrace", "maxprojection"
    maskAlpha: ALPHA_MASK_SLIDER_3D_DEFAULT[0],
    brightness: BRIGHTNESS_SLIDER_LEVEL_DEFAULT[0],
    density: DENSITY_SLIDER_LEVEL_DEFAULT[0],
    levels: LEVELS_SLIDER_DEFAULT,
    region: [0,1,0,1,0,1], // or ignored if slice is specified with a non-3D mode
    slice: undefined, // or integer slice to show in view mode XY, YZ, or XZ.  mut. ex with region
  }
};
