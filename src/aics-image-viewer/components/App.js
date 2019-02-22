// 3rd Party Imports
import { Layout } from "antd";
import React from 'react';
import { includes } from 'lodash';
import { 
  AICSvolumeDrawable, 
  AICSvolumeLoader 
} from 'volume-viewer';

import HttpClient from '../shared/utils/httpClient';
import UtilsService from '../shared/utils/utilsService';
import enums from '../shared/enums';
import {
  CELL_ID_QUERY,
  CELL_LINE_QUERY,
  CELL_SEGMENTATION_CHANNEL_NAME,
  FOV_ID_QUERY,
  IMAGE_NAME_QUERY,
  LEGACY_IMAGE_ID_QUERY,
  LEGACY_IMAGE_SERVER,
  IMAGE_SERVER,
  OBSERVED_CHANNEL_KEY,
  SEGMENTATION_CHANNEL_KEY,
  CONTOUR_CHANNEL_KEY,
  OTHER_CHANNEL_KEY,
  PRESET_COLORS_0,
  ALPHA_MASK_SLIDER_3D_DEFAULT,
  ALPHA_MASK_SLIDER_2D_DEFAULT,
  SEGMENTED_CELL,
  VOLUME_ENABLED,
  ISO_SURFACE_ENABLED,
  ALPHA_MASK_SLIDER_LEVEL,
  FULL_FIELD_IMAGE,
} from '../shared/constants';

import ControlPanel from './ControlPanel';
import ViewerWrapper from './CellViewerCanvasWrapper';

import '../assets/styles/globals.scss';
import '../assets/styles/no-ui-slider.min.scss';

const ViewMode = enums.viewMode.mainMapping;
const channelGroupingMap = enums.channelGroups.channelGroupingMap;
const { Sider, Content } = Layout;

const OK_STATUS = 'OK';
const ERROR_STATUS = 'Error';
const INIT_COLORS = PRESET_COLORS_0;
const CHANNEL_SETTINGS_KEY = 'channelSettings';

export default class App extends React.Component {

  static setInitialChannelConfig(channelNames, channelColors) {
    return channelNames.map((channel, index) => {
      return {
        name: channel || "Channel " + index,
        channelEnabled: true,
        [VOLUME_ENABLED]: index < 3,
        [ISO_SURFACE_ENABLED]: false,
        isovalue: 100,
        opacity: 1.0,
        color: channelColors[index] ? channelColors[index].slice() : [226, 205, 179], // guard for unexpectedly longer channel list
        dataReady: false
      };
    });
  }

  static createChannelGrouping(channels) {
    if (channels) {
      const grouping = channels.reduce((acc, channel, index) => {
        if (includes(channelGroupingMap[OBSERVED_CHANNEL_KEY], channel)) {
          acc[OBSERVED_CHANNEL_KEY].push(index);
        } else if (includes(channelGroupingMap[SEGMENTATION_CHANNEL_KEY], channel)) {
          acc[SEGMENTATION_CHANNEL_KEY].push(index);
        } else if (includes(channelGroupingMap[CONTOUR_CHANNEL_KEY], channel)) {
          acc[CONTOUR_CHANNEL_KEY].push(index);
        } else {
          if (!acc[OTHER_CHANNEL_KEY]) {
            acc[OTHER_CHANNEL_KEY] = [];
          }
          acc[OTHER_CHANNEL_KEY].push(index);
        }
        return acc;
      }, {
        [OBSERVED_CHANNEL_KEY]: [],
        [SEGMENTATION_CHANNEL_KEY]: [],
        [CONTOUR_CHANNEL_KEY]: [],
      });
      return grouping;
    }
    return {};
  }

  constructor(props) {
    super(props);

    this.state = {
      image: null,
      files: null,
      mode: ViewMode.threeD,
      queryInput: null,
      queryInputType: null,
      queryErrorMessage: null,
      sendingQueryRequest: false,
      openFilesOnly: false,
      // channelGroupedByType is an object where channel indexes are grouped by type (observed, segmenations, and countours)
      // {observed: channelIndex[], segmenations: channelIndex[], contours: channelIndex[], other: channelIndex[] }
      channelGroupedByType: {},
      // did the requested image have a cell id (in queryInput)?
      hasCellId: false,
      // state set by the UI:
      userSelections: {
        mode: ViewMode.threeD,
        controlPanelClosed: false,
        autorotate: false,
      // is there currently a single cell showing, or a full field?
        imageType: SEGMENTED_CELL,
        // fieldFieldOrSegmented
        [ALPHA_MASK_SLIDER_LEVEL]: ALPHA_MASK_SLIDER_3D_DEFAULT,
        // channelSettings is a flat list of objects of this type:
        // { name, enabled, volumeEnabled, isosurfaceEnabled, isovalue, opacity, color, dataReady}
        [CHANNEL_SETTINGS_KEY]: [],
      }
    };

    this.openImage = this.openImage.bind(this);
    this.loadFromJson = this.loadFromJson.bind(this);
    this.onViewModeChange = this.onViewModeChange.bind(this);
    this.updateChannelTransferFunction = this.updateChannelTransferFunction.bind(this);
    this.onAutorotateChange = this.onAutorotateChange.bind(this);
    this.onSwitchFovCell = this.onSwitchFovCell.bind(this);
    this.setQueryInput = this.setQueryInput.bind(this);
    this.handleOpenImageResponse = this.handleOpenImageResponse.bind(this);
    this.handleOpenImageException = this.handleOpenImageException.bind(this);
    this.onChannelDataReady = this.onChannelDataReady.bind(this);
    this.updateURLSearchParams = this.updateURLSearchParams.bind(this);
    this.toggleControlPanel = this.toggleControlPanel.bind(this);
    this.onUpdateImageMaskAlpha = this.onUpdateImageMaskAlpha.bind(this);
    this.onUpdateImageBrightness = this.onUpdateImageBrightness.bind(this);
    this.onUpdateImageDensity = this.onUpdateImageDensity.bind(this);
    this.onUpdateImageGammaLevels = this.onUpdateImageGammaLevels.bind(this);
    this.onUpdateImageMaxProjectionMode = this.onUpdateImageMaxProjectionMode.bind(this);
    this.setImageAxisClip = this.setImageAxisClip.bind(this);
    this.onApplyColorPresets = this.onApplyColorPresets.bind(this);
    this.setAxisClip = this.setAxisClip.bind(this);
    this.getNumberOfSlices = this.getNumberOfSlices.bind(this);
    this.makeUpdatePixelSizeFn = this.makeUpdatePixelSizeFn.bind(this);
    this.setUserSelectionsInState = this.setUserSelectionsInState.bind(this);
    this.changeChannelSettings = this.changeChannelSettings.bind(this);
    this.changeOneChannelSetting = this.changeOneChannelSetting.bind(this);
    document.addEventListener('keydown', this.handleKeydown, false);
  }

  stopPollingForImage() {
    if (this.openImageInterval) {
      clearInterval(this.openImageInterval);
      this.openImageInterval = null;
    }
  }

  checkDimensionsMatch(a, b) {
    return ((a.width === b.width) ||
      (a.height === b.height) ||
      (a.rows === b.rows) ||
      (a.cols === b.cols) ||
      (a.tiles === b.tiles) ||
      (a.tile_width === b.tile_width) ||
      (a.tile_height === b.tile_height) ||
      (a.atlas_width === b.atlas_width) ||
      (a.atlas_height === b.atlas_height));
  }

  handleOpenImageResponse(resp, queryType, imageDirectory, doResetViewMode) {
    if (resp.data.status === OK_STATUS) {

      this.setState({
        currentlyLoadedImagePath: imageDirectory,
        queryErrorMessage: null,
        cachingInProgress: false,
        mode: doResetViewMode ? ViewMode.threeD : this.state.userSelections.mode
      });
      this.loadFromJson(resp.data, resp.data.name, resp.locationHeader);
      this.stopPollingForImage();
    } else if (resp.data.status === ERROR_STATUS) {
      console.log(ERROR_STATUS);
      this.stopPollingForImage();
    } else {
      this.setState({
        cachingInProgress: true
      });
    }
  }

  handleOpenImageException(resp) {
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
    // this.setState({
    //   queryErrorMessage: message,
    //   sendingQueryRequest: false,
    //   cachingInProgress: false
    // });
    console.log(message);
    this.stopPollingForImage();
  }

  openImage(imageDirectory, queryType, doResetViewMode) {
    if (imageDirectory === this.state.currentlyLoadedImagePath) {
      return;
    }

    const BASE_URL = queryType === LEGACY_IMAGE_ID_QUERY ? LEGACY_IMAGE_SERVER : IMAGE_SERVER;
    const toLoad = BASE_URL + imageDirectory + '_atlas.json';
    //const toLoad = BASE_URL + 'AICS-10/AICS-10_5_5_atlas.json';
    // retrieve the json file directly from its url
    HttpClient.getJSON(toLoad, {absolute:true, mode:'cors'})
      .then(resp => {
        // set up some stuff that the backend caching service was doing for us, to spoof the rest of the code
        resp.data.status = OK_STATUS;
        resp.locationHeader = toLoad.substring(0, toLoad.lastIndexOf('/') + 1);
        return this.handleOpenImageResponse(resp, 0, imageDirectory, doResetViewMode);
      })
      .catch(resp => this.handleOpenImageException(resp));
  }

  loadFromJson(obj, title, locationHeader) {
    const { userSelections } = this.state;
    const aimg = new AICSvolumeDrawable(obj);
    // if same number of channels, leave the app state alone.
    let newChannelSettings = userSelections[CHANNEL_SETTINGS_KEY].length === obj.channel_names.length ? 
      userSelections[CHANNEL_SETTINGS_KEY] : App.setInitialChannelConfig(obj.channel_names, INIT_COLORS);
    let channelGroupedByType = App.createChannelGrouping(obj.channel_names);
    // set image colors
    for (let i = 0; i < obj.channel_names.length; ++i) {
      aimg.updateChannelColor(i, newChannelSettings[i].color);
    }
    if (userSelections.imageType === SEGMENTED_CELL) {
      this.onUpdateImageMaskAlpha(ALPHA_MASK_SLIDER_3D_DEFAULT);
    } else {
      this.onUpdateImageMaskAlpha(ALPHA_MASK_SLIDER_2D_DEFAULT);
    }
    // if we have some url to prepend to the atlas file names, do it now.
    if (locationHeader) {
      obj.images = obj.images.map(img => ({ ...img, name: `${locationHeader}${img.name}` }));      
    }
    // GO OUT AND GET THE VOLUME DATA.
    AICSvolumeLoader.loadVolumeAtlasData(obj.images, (url, channelIndex, atlasdata, atlaswidth, atlasheight) => {
      aimg.setChannelDataFromAtlas(channelIndex, atlasdata, atlaswidth, atlasheight);
      if (aimg.channelNames()[channelIndex] === CELL_SEGMENTATION_CHANNEL_NAME) {
        aimg.setChannelAsMask(channelIndex);
      }
      this.onChannelDataReady(channelIndex);
    });

    let nextState = {
      image: aimg,
      channelGroupedByType,
      userSelections : {
        ...this.state.userSelections,
        [CHANNEL_SETTINGS_KEY]: newChannelSettings,
      }
    };
    this.setState(nextState);
  }

  setUserSelectionsInState(newState) {
    this.setState({
      userSelections: {
        ...this.state.userSelections,
        ...newState,
      }
    });
  }

  onViewModeChange(newMode) {
    const { userSelections } = this.state;
    let newSelectionState = {
      mode: newMode,
    };
      // if switching between 2D and 3D reset alpha mask to default (off in in 2D, 50% in 3D)
      // if full field, dont mask
    if (userSelections.mode === ViewMode.threeD && newMode !== ViewMode.threeD) {
      // Switching to 2d 
      newSelectionState = {
        mode: newMode,
        [ALPHA_MASK_SLIDER_LEVEL]: ALPHA_MASK_SLIDER_2D_DEFAULT,
      };
    } else if (
      userSelections.mode !== ViewMode.threeD && 
      newMode === ViewMode.threeD && 
      this.state.userSelections.imageType === SEGMENTED_CELL
    ) {
      // switching to 3d 
      newSelectionState = {
          mode: newMode,
          [ALPHA_MASK_SLIDER_LEVEL]: ALPHA_MASK_SLIDER_3D_DEFAULT,
      };
    }
    this.setUserSelectionsInState(newSelectionState);
  }

  onUpdateImageMaskAlpha(sliderValue) {
    if (sliderValue) {
      this.setUserSelectionsInState({ [ALPHA_MASK_SLIDER_LEVEL]: sliderValue });
    }
  }

  onUpdateImageBrightness(val) {
    this.state.image.setUniform('BRIGHTNESS', val, true, true);
  }

  onUpdateImageDensity(val) {
    this.state.image.setUniform("DENSITY", val, true, true);
  }

  onUpdateImageGammaLevels(gmin, gmax, gscale) {
    this.state.image.setUniformNoRerender('GAMMA_MIN', gmin, true, true);
    this.state.image.setUniformNoRerender('GAMMA_MAX', gmax, true, true);
    this.state.image.setUniform('GAMMA_SCALE', gscale, true, true);
  }

  onUpdateImageMaxProjectionMode(checked) {
    this.state.image.setUniform('maxProject', checked?1:0, true, true);
  }

  setImageAxisClip(axis, minval, maxval, isOrthoAxis) {
    if (this.state.image) {
      this.state.image.setAxisClip(axis, minval, maxval, isOrthoAxis);
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

  onAutorotateChange() {
    this.setUserSelectionsInState({autorotate: !this.state.userSelections.autorotate});
  }

  buildName(cellLine, fovId, cellId) {
    cellId = cellId ? ('_' + cellId) : "";
    return `${cellLine}/${cellLine}_${fovId}${cellId}`;
  }

  onSwitchFovCell(value) {
    if (this.state.hasCellId) {
      const name = this.buildName(
        this.state.queryInput.cellLine, 
        this.state.queryInput.fovId, 
        value === FULL_FIELD_IMAGE ? null : this.state.queryInput.cellId
      );
      const type = value === FULL_FIELD_IMAGE ? FOV_ID_QUERY : CELL_ID_QUERY;
      this.openImage(name, type, false);
      this.setState((prevState) => {
        return {
          sendingQueryRequest: true,
          userSelections: {
              ...this.state.userSelections,
            imageType: value,
          }
        };
      });
    }
  }

  onChannelDataReady(index) {
    this.setState((prevState) => {
      const newChannels = prevState.userSelections.channelSettings.map((channel, channelindex) => { 
        return index === channelindex ? {...channel, dataReady:true} : channel;
      });
      if (index === 0) {
        return {
          sendingQueryRequest: false,
          userSelections: {
            ...this.state.userSelections,
            channelSettings: newChannels
          }
        };
      }
      else {
        return {
          userSelections: {
            ...this.state.userSelections,
            channelSettings: newChannels
          }
        };
      } 
    });
  }

  onColorChangeComplete(newrgba, oldrgba, indx) {
  }

  onApplyColorPresets(presets) {
    this.setState((prevState) => {
      const { userSelections } = prevState;
      presets.forEach((color, index) => {
        prevState.image.updateChannelColor(index, color);
      });
  
      return {
        userSelections: {
          ...this.state.userSelections,
          channelSettings: userSelections.channelSettings.map((channel, channelindex) => { 
          return presets[channelindex] ? {...channel, color:presets[channelindex]} : channel;
        })
        }
      };
    });
  }

  setAxisClip(axis, minval, maxval, isOrthoAxis) {
    if (this.state.image) {
      this.state.image.setAxisClip(axis, minval, maxval, isOrthoAxis);
    }
  }

  /**
   * Toggles checkboxes and channels in 3d view
   * @param indexes string array of channel indexes to toggle
   * @param turnOn boolean - determines if channels in array should get turned on or off
   */

  changeChannelSettings(indices, keyToChange, newValue ) {
    const { userSelections } = this.state;
    const newChannels = userSelections[CHANNEL_SETTINGS_KEY].map((channel, index) => {
      return { ...channel, [keyToChange]: includes(indices, index) ? newValue : channel[keyToChange] };
    });
    this.setUserSelectionsInState({[CHANNEL_SETTINGS_KEY]: newChannels});
  }

  handleChangeToImage(index, keyToChange, newValue) {
    switch (keyToChange) {
      case 'isovalue':
        this.state.image.updateIsovalue(index, newValue);
        break;
      case 'opacity':
        this.state.image.updateOpacity(index, newValue);
        break;
      case 'color':
        let newColor = [newValue.r, newValue.g, newValue.b, newValue.a];
        this.state.image.updateChannelColor(index, newColor);
        break;
      default:

    }
  }

  changeOneChannelSetting(channelIndex, keyToChange, newValue) {
    const { userSelections } = this.state;
    const newChannels = userSelections[CHANNEL_SETTINGS_KEY].map((channel, index) => {
      return index === channelIndex ? { ...channel, [keyToChange]: newValue } : channel;
    });
    this.setUserSelectionsInState({[CHANNEL_SETTINGS_KEY]: newChannels});
    this.handleChangeToImage(channelIndex, keyToChange, newValue);
  }

  makeOnSaveIsosurfaceHandler(index, type) {
    return () => {
      this.props.image.saveChannelIsosurface(index, type);
    };
  }

  updateChannelTransferFunction(index, lut, controlPoints) {
    if (this.state.image) {
      this.state.image.getChannel(index).setLut(lut, controlPoints);
      this.state.image.fuse();
    }
  }

  updateURLSearchParams(input, type) {
    if (input && type) {
      const params = new URLSearchParams();
      params.set(type, input);
      window.history.pushState({}, '', `${location.pathname}?${params}`);
      this.setState({[type]: input});

    }
  }

  setQueryInput(input, type) {
    let name = input;
    if (type === FOV_ID_QUERY) {
      name = this.buildName(input.cellLine, input.fovId);
    }
    else if (type === CELL_ID_QUERY) {
      name = this.buildName(input.cellLine, input.fovId, input.cellId);
    }
    else if (type === IMAGE_NAME_QUERY) {
      // decompose the name into cellLine, fovId, and cellId ?
      const components = input.split("_");
      let cellLine = "";
      let fovId = "";
      let cellId = "";
      if (components.length >= 2) {
        cellLine = components[0];
        fovId = components[1];
        type = FOV_ID_QUERY;
        if (components.length > 2) {
          cellId = components[2];
          type = CELL_ID_QUERY;
        }
        name = this.buildName(cellLine, fovId, cellId);
      }
      input = {
        cellLine,
        fovId,
        cellId
      };
    }
    // LEGACY_IMAGE_ID_QUERY is a passthrough

    this.setState({
      queryInput: input,
      queryInputType: type,
      hasCellId: !!input.cellId,
      isShowingSegmentedCell: !!input.cellId,
      sendingQueryRequest: true
    });
    this.openImage(name, type, true);
  }

  toggleVolumeEnabledAndFuse(index, enable) {
    const { image } = this.state;
    image.setVolumeChannelEnabled(index, enable);
    image.fuse();
  }

  updateImageAlphaMaskFromSliderValue() {
    let val = 1 - (this.state.userSelections.alphaMaskSliderLevel[0] / 100.0);
    this.state.image.setUniform('maskAlpha', val, true, true);
  }

  updateImageChannelsFromAppState() {
    const { userSelections, image } = this.state;
    console.log('updating from state')
    if (image) {
      // set alpha mask state
      this.updateImageAlphaMaskFromSliderValue();
      // set cameraMode
      this.state.image.setUniform('isOrtho', userSelections.mode === ViewMode.threeD ? 0.0 : 1.0);
      // apply channel settings
      userSelections.channelSettings.forEach((channel, index) => {
        const volenabled = channel[VOLUME_ENABLED];
        const isoenabled = channel[ISO_SURFACE_ENABLED];
        this.toggleVolumeEnabledAndFuse(index, volenabled);
        if (image.hasIsosurface(index)) {
          if (!isoenabled) {
            image.destroyIsosurface(index);
          } 
        } else {
          if (isoenabled) {
            image.createIsosurface(index, channel.isovalue, channel.opacity);
          }
        }
      });
    }
  }

  componentWillUpdate(nextProps, nextState) {
    const channelsChanged = this.state.userSelections.channelSettings !== nextState.userSelections.channelSettings;
    const imageChanged = this.state.image !== nextState.image;
    if (imageChanged && nextState.image) {
      nextState.image.fuse();
    }
    // update mesh colors only if it's the right kind of change
    if (channelsChanged && nextState.channels) {
      nextState.image.updateMeshColors();
    }
  }

  // TODO : For use as a true react component, maybe we could pass the image id and query type as PROPS!!!!!!!!!!
  // and the getParameterByName could be done in the index.html or index.js.
  componentWillMount() {
    const legacyImageIdToShow = UtilsService.getParameterByName(LEGACY_IMAGE_ID_QUERY);
    if (legacyImageIdToShow) {
      this.setQueryInput(legacyImageIdToShow, LEGACY_IMAGE_ID_QUERY);
    }
    else {
      const imageIdToShow = UtilsService.getParameterByName(IMAGE_NAME_QUERY);
      if (imageIdToShow) {
        this.setQueryInput(imageIdToShow, IMAGE_NAME_QUERY);
      }
      else {
        // cellid and cellline and fovid
        const cellId = UtilsService.getParameterByName(CELL_ID_QUERY);
        const fovId = UtilsService.getParameterByName(FOV_ID_QUERY);
        const cellLine = UtilsService.getParameterByName(CELL_LINE_QUERY);
        if (cellId && fovId && cellLine) {
          this.setQueryInput({cellId, fovId, cellLine}, CELL_ID_QUERY);
        }
        else if (fovId && cellLine) {
          this.setQueryInput({fovId, cellLine}, FOV_ID_QUERY);
        }
      }
    }
  }

  componentDidUpdate(prevProps, prevState) {
    this.updateImageChannelsFromAppState();
    // if (this.state.userSelections[CHANNEL_SETTINGS_KEY] !== prevState.userSelections[CHANNEL_SETTINGS_KEY]) {
    // }
    // delayed for the animation to finish
    if (prevState.userSelections.controlPanelClosed !== this.state.userSelections.controlPanelClosed) {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 200);
    }
    if (this.state.image) {
      this.state.image.updateMeshColors();
      this.state.image.fuse();
    }
  }

  toggleControlPanel(value) {
    this.setState({ 
      userSelections: {
        ...this.state.userSelections,
      controlPanelClosed: value
    }});
  }

  getNumberOfSlices() {
    if (this.state.image) {
      return { x: this.state.image.x, y: this.state.image.y, z: this.state.image.z };
    }
    return {};
  }

  render() {
    const { userSelections } = this.state;
    return (
      <Layout className="cell-viewer-app">
            <Sider
              className="control-pannel-holder"
              collapsible={true}
              defaultCollapsed={false}
              collapsedWidth={0}
              collapsed={this.state.userSelections.controlPanelClosed}
              onCollapse={this.toggleControlPanel}
              width={450}
            >
              <ControlPanel 
                // image state
                imageName={this.state.image ? this.state.image.name : false}
                hasImage={!!this.state.image}
                pixelSize={this.state.image ? this.state.image.name : false}
                channelDataChannels={this.state.image ? this.state.image.channelData.channels : null}
                channelGroupedByType={this.state.channelGroupedByType}
                hasCellId={this.state.hasCellId}
                // user selections
                channels={userSelections.channelSettings}
                mode={userSelections.mode}
                imageType={userSelections.imageType}
                autorotate={userSelections.autorotate}
                alphaMaskSliderLevel={userSelections[ALPHA_MASK_SLIDER_LEVEL]}
                // functions
                updateChannelTransferFunction={this.updateChannelTransferFunction}
                onViewModeChange={this.onViewModeChange}
                onColorChangeComplete={this.onColorChangeComplete}
                onAutorotateChange={this.onAutorotateChange}
                onSwitchFovCell={this.onSwitchFovCell}
                onUpdateImageDensity={this.onUpdateImageDensity}
                onUpdateImageBrightness={this.onUpdateImageBrightness}
                onUpdateImageMaskAlpha={this.onUpdateImageMaskAlpha}
                onUpdateImageGammaLevels={this.onUpdateImageGammaLevels}
                onUpdateImageMaxProjectionMode={this.onUpdateImageMaxProjectionMode}
                setImageAxisClip={this.setImageAxisClip}
                onApplyColorPresets={this.onApplyColorPresets}
                makeUpdatePixelSizeFn={this.makeUpdatePixelSizeFn}
                makeOnSaveIsosurfaceHandler={this.makeOnSaveIsosurfaceHandler}
                changeChannelSettings={this.changeChannelSettings}
                changeOneChannelSetting={this.changeOneChannelSetting}
              />
              </Sider>
              <Layout className="cell-viewer-wrapper">
                <Content>
                  <ViewerWrapper
                    image={this.state.image}
                    onAutorotateChange={this.onAutorotateChange}
                    setAxisClip={this.setImageAxisClip}
                    mode={userSelections.mode}
                    autorotate={userSelections.autorotate}
                    loadingImage={this.state.sendingQueryRequest}
                    numSlices={this.getNumberOfSlices()}
                  />
                </Content>
              </Layout>
        </Layout>
    );
  }

  componentWillUnmount() {
    document.removeEventListener('keydown', this.handleKeydown, false);
  }
}

