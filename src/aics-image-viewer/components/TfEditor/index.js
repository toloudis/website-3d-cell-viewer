import React from 'react';
import * as d3 from "d3";
import './styles.scss';

export default class MyTfEditor extends React.Component {

    static get is() {
        return 'tf-editor';
    }

    constructor(props) {
        super(props);
        this.id = props.id;
        this._width = props.width;
        this._height = props.height;
        this.canvas = React.createRef();
        this.createElements = this.createElements.bind(this);
        this.ready = this.ready.bind(this);
        this._initializeElements = this._initializeElements.bind(this);
        this._updateScales = this._updateScales.bind(this);
        this._drawChart = this._drawChart.bind(this);
        this._redraw = this._redraw.bind(this);
        this._drawCanvas = this._drawCanvas.bind(this);
        this.createElements();
        this.svgElement = React.createRef();
    }

    componentDidMount() {
        this.setData(this.props.index, this.props.channelData);
        this.ready();
    }

    createElements() {
        // Custom margins
        this.margin = {
            top: 5,
            right: 20,
            bottom: 5,
            left: 25
        };
        this.formatCount = d3.format(",.0f");

        // Axis scales
        this.xScale = d3.scaleLinear();
        this.yScale = d3.scaleLinear();
        this.binScale = d3.scaleLog();
        // Area for the opacity map representation
        this.area = d3.area();

        // Create histogram object
        this.bins = d3.histogram();

        // Scale to fit the gradient in the canvas output
        this.canvasScale = d3.scaleLinear();

        // Scale data range to 8bit
        this.dataScale = d3.scaleLinear();

        // Keep track of control points interaction
        this.dragged = null;
        this.selected = null;
        this.last_color = 'green';
    }

    _initializeElements() {
        var extent = [0, 255];
        if (this.fitToData && this._data && this._data.length > 0) {
            extent = d3.extent(this._data);
        }
        var me = this;
        this.xScale
            .rangeRound([0, this._width])
            .domain(extent);
        this.yScale
            .domain([0, 1])
            .range([this._height, 0]);
        this.binScale
            .domain([1, 10])
            .range([this._height, 0])
            .base(2)
            .clamp([0, this._height]);
        this.bins
            .domain(this.xScale.domain())
            .thresholds(this.xScale.ticks(this.numberBins));
        if (this.props.controlPoints.length === 0) {
            this.push('controlPoints', {
                'x': extent[0],
                'opacity': 0,
                'color': 'white'
            });
            this.push('controlPoints', {
                'x': extent[1],
                'opacity': 1,
                'color': 'white'
            });
        }
        this.selected = this.props.controlPoints[0];
        this.area
            .x(function (d) {
                return me.xScale(d.x);
            })
            .y0(function (d) {
                return me.yScale(d.opacity);
            })
            .y1(this._height)
            .curve(d3.curveLinear);

        this.canvasScale.range([0, 1]);
        this.dataScale.domain(extent).range([0, 255]);

        // Canvas element selector to output the result
        this.canvasSelector = this.canvasSelector || "#canvas-" + this.id;

    }

    // Get the 2D canvas context where the TF will be drawn
    _canvasContext() {
        let canvas_element = this.canvas.current;
        if (canvas_element !== null) {
            return canvas_element.getContext("2d");
        }
        return canvas_element;
    }

    // Perform the drawing
    _drawChart() {
        var me = this;
        var g = this.svg.append("g")
            .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");

        // Draw initial histogram
        this._redrawHistogram();

        // Gradient definitions
        g.append("defs").append("linearGradient")
            .attr("id", "tfGradient-" + this.id)
            //.attr("gradientUnits", "userSpaceOnUse")
            .attr("gradientUnits", "objectBoundingBox")
            .attr("spreadMethod", "pad")
            .attr("x1", "0%").attr("y1", "0%")
            .attr("x2", "100%").attr("y2", "0%");
        //.attr("x1", me.xScale(0)).attr("y1", me.yScale(0))
        //.attr("x2", me.xScale(255)).attr("y2", me.yScale(0));

        // Draw control points
        g.append("path")
            .datum(me.props.controlPoints)
            .attr("class", "line")
            .attr("fill", "url(#tfGradient-" + this.id + ")")
            .attr("stroke", "white")
            .call(function () {
                me._redraw();
            });

        // Mouse interaction handler
        g.append("rect")
            .attr("y", -10)
            .attr("x", -10)
            .attr("width", me._width + 20)
            .attr("height", me._height + 20)
            .style("opacity", 0)
            .on("mousedown", function () {
                // setPointerCapture
                me._mousedown();
            })
            .on("mouseup", function () {
                me._mouseup();
                // releasePointerCapture
            })
            .on("mousemove", function () {
                me._mousemove();
            });

        // Draw axis
        var xTicks = me.xScale.ticks(me.numberTicks);
        xTicks[xTicks.length - 1] = me.xScale.domain()[1];
        g.append("g")
            .attr("class", "axis axis--x")
            .attr("transform", "translate(0," + me._height + ")")
            .call(d3.axisBottom(me.xScale).tickValues(xTicks));

        g.append("g")
            .attr("class", "axis axis--y")
            .attr("transform", "translate(0, 0)")
            .call(d3.axisLeft(me.yScale).ticks(me.numberTicks));
    }

    // update scales with new data input
    _updateScales() {
        if (this.fitToData) {
            var dataExtent = d3.extent(this._data);
            // First obtain the index of points to be maintain;
            var x0 = -1;
            var x1 = -1;
            // Override dirty checking
            var controlPoints = this.props.controlPoints;
            for (var i = controlPoints.length - 1; i >= 0; i--) {
                x1 = (controlPoints[i].x >= dataExtent[1]) ? i : x1;
                if (controlPoints[i].x <= dataExtent[0]) {
                    x0 = i;
                    break;
                }
            }
            // Delete control points out of range
            if (x1 != -1) {
                controlPoints[x1].x = dataExtent[1];
                controlPoints.splice(x1, controlPoints.length - x1 - 1);
            }
            if (x0 != -1) {
                controlPoints[x0].x = dataExtent[0];
                controlPoints.splice(0, x0);
            }
            this.props.controlPoints = [];
            this.props.controlPoints = controlPoints;
            this.xScale.domain(dataExtent);
            this.dataScale.domain(dataExtent);
        } else {
            this.xScale.domain([0, 255]);
            this.dataScale.domain([0, 255]);
        }
        this.bins.domain(this.xScale.domain())
            .thresholds(this.xScale.ticks(this.numberBins));
    }

    // update the axis with the new data input
    _updateAxis() {
        let svg = d3.select(this.svgElement.current).select("g");
        var xTicks = this.xScale.ticks(this.numberTicks);
        xTicks[xTicks.length - 1] = this.xScale.domain()[1];
        svg.selectAll(".axis.axis--x").call(d3.axisBottom(this.xScale).tickValues(xTicks));
    }

    // update the chart data
    _redrawHistogram() {
        var me = this;
        d3.select(this.svgElement.current).select("g").selectAll(".bar").remove();
        if (this._data && this._data.length > 0) {
            var bins = this.bins(this._data);
            this.binScale.domain([0.1, d3.max(bins, function (d) {
                return d.length;
            })]);
            var bar = d3.select(this.svgElement.current).select("g").selectAll(".bar").data(bins);
            var barEnter = bar.enter().append("g")
                .attr("class", "bar")
                .attr("transform", function (d) {
                    return "translate(" + me.xScale(d.x0) + "," + me.binScale(d.length) + ")";
                });

            barEnter.append("rect")
                .attr("x", 1)
                .attr("width", function (d) {
                    return d.x1 - d.x0;
                })
                .attr("height", function (d) {
                    return me._height - me.binScale(d.length);
                });

            d3.select(this.svgElement.current).select("g").selectAll(".bar").lower();

            bar.exit().remove();
        }
    }

    // Update the chart content
    _redraw() {
        var me = this;
        const {
            controlPoints
        } = this.props;
        if (!controlPoints) {
            return;
        }
        var svg = d3.select(me.svgElement.current).select("g");
        svg.select("path").datum(controlPoints).attr("d", me.area);

        // Add circle to connect and interact with the control points
        var circle = svg.selectAll("circle").data(controlPoints)

        circle.enter().append("circle")
            .attr("cx", function (d) {
                return me.xScale(d.x);
            })
            .attr("cy", function (d) {
                return me.yScale(d.opacity);
            })
            .style("fill", function (d) {
                return d.color;
            })
            .attr("r", 1e-6)
            .on("mousedown", function (d) {
                me.selected = me.dragged = d;
                me.last_color = d.color;
                me._redraw();
            })
            .on("mouseup", function () {
                me._mouseup();
            })
            .on("contextmenu", function (d, i) {
                // react on right-clicking
                d3.event.preventDefault();
                d.color = me.svgElement.current.querySelector("#picker-" + me.id).value;
                me._redraw();
            })
            .transition()
            .duration(750)
            .attr("r", 5.0);

        circle.classed("selected", function (d) {
            return d === me.selected;
        })
            .style("fill", function (d) {
                return d.color;
            })
            .attr("cx", function (d) {
                return me.xScale(d.x);
            })
            .attr("cy", function (d) {
                return me.yScale(d.opacity);
            })
            .raise();

        circle.exit().remove();

        // Create a linear gradient definition of the control points
        var gradient = svg.select("linearGradient").selectAll("stop").data(controlPoints);

        var MAX_DISPLAY_OPACITY = 0.9;

        gradient.enter().append("stop")
            .attr("stop-color", function (d) {
                return d.color;
            })
            .attr("stop-opacity", function (d) {
                return Math.min(d.opacity, MAX_DISPLAY_OPACITY);
            })
            .attr("offset", function (d) {
                var l = (controlPoints[controlPoints.length - 1].x - controlPoints[0].x);
                return "" + ((d.x - controlPoints[0].x) / l * 100) + "%";
            });

        gradient.attr("stop-color", function (d) {
            return d.color;
        })
            .attr("stop-opacity", function (d) {
                return Math.min(d.opacity, MAX_DISPLAY_OPACITY);
            })
            .attr("offset", function (d) {
                var l = (controlPoints[controlPoints.length - 1].x - controlPoints[0].x);
                return "" + ((d.x - controlPoints[0].x) / l * 100) + "%";
            });

        gradient.exit().remove();

        if (d3.event) {
            d3.event.preventDefault();
            d3.event.stopPropagation();
        }

        // Draw gradient in canvas too
        d3.timeout(function () {
            me._drawCanvas();
        }, 100);
    }

    /**
     * Draw the TF output in the canvas container.
     */
    _drawCanvas() {
        if (this.props.controlPoints != undefined && this.props.controlPoints.length > 0) {

            var extent = [this.props.controlPoints[0].x, this.props.controlPoints[this.props.controlPoints.length - 1].x];
            // Convinient access
            var x0 = this.dataScale(extent[0]),
                x1 = this.dataScale(extent[1]);
            // hack to handle degeneracy when not enough control points or control points too close together
            if (x1 === x0) {
                return;
            }
            this.canvasScale.domain([x0, x1]);
            var ctx = this._canvasContext();
            if (ctx == null) {
                return;
            }
            // Clear previous result
            var width = ctx.canvas.clientWidth || 256;
            var height = ctx.canvas.clientHeight || 10;
            ctx.clearRect(0, 0, width, height);
            // Draw new result
            //scale to coordinates in case this canvas's width is not 256.
            var x0c = x0 * width / 256;
            var x1c = x1 * width / 256;
            var grd = ctx.createLinearGradient(x0c, 0, x1c, 0);
            for (var i = 0; i < this.props.controlPoints.length; i++) {
                var d = this.props.controlPoints[i];
                //var d = this.get('controlPoints', i);
                var color = d3.color(d.color);
                color.opacity = d.opacity;
                //grd.addColorStop((d.x - x0) / Math.abs(x1 - x0), color.toString());
                grd.addColorStop(this.canvasScale(this.dataScale(d.x)), color.toString());
            }
            ctx.fillStyle = grd;
            ctx.fillRect(x0c, 0, x1c - x0c + 1, height);

            // extract one row
            var imagedata = ctx.getImageData(x0c, 0, x1c - x0c + 1, 1);
            let opacityGradient = new Uint8Array(256);
            for (var i = 0; i < 256; ++i) {
                // extract the alphas.
                opacityGradient[i] = imagedata.data[i * 4 + 3];
            }

            // notify observers...
            // if (this.onChangeCallback) {
            //     this.onChangeCallback(this._channelIndex,
            //         opacityGradient,
            //         this.props.controlPoints
            //     );
            // }

            this.props.updateChannelTransferFunction(this.props.index,
                opacityGradient,
                this.props.controlPoints
            );
            if (ctx.canvas.parentNode._x3domNode != undefined) {
                ctx.canvas.parentNode._x3domNode.invalidateGLObject();
            }
        }
    }

    /////// User interaction related event callbacks ////////

    _mousedown() {
        var me = this;
        var pos = d3.mouse(me.svg.node());
        var point = {
            "x": me.xScale.invert(Math.max(0, Math.min(pos[0] - me.margin.left, me._width))),
            "opacity": me.yScale.invert(Math.max(0, Math.min(pos[1] - me.margin.top, me._height))),
            "color": me.last_color
        };
        me.selected = me.dragged = point;
        var bisect = d3.bisector(function (a, b) {
            return a.x - b.x;
        }).left;
        var indexPos = bisect(me.controlPoints, point);
        this.props.controlPoints.splice(indexPos, 0, point);
        me._redraw();
    }

    _mousemove() {
        if (!this.dragged) {
            return;
        }
        function equalPoint(a, index, array) {
            return a.x == this.x && a.opacity == this.opacity && a.color == this.color;
        };
        var index = this.props.controlPoints.findIndex(equalPoint, this.selected);
        if (index == -1) {
            return;
        }
        var m = d3.mouse(d3.select(this.svgElement.current).node());
        this.selected = this.dragged = this.props.controlPoints[index];
        this.dragged.x = this.xScale.invert(Math.max(0, Math.min(this._width, m[0] - this.margin.left)));
        this.dragged.opacity = this.yScale.invert(Math.max(0, Math.min(this._height, m[1] - this.margin.top)));
        var bisect = d3.bisector(function (a, b) {
            return a.x - b.x;
        }).left;
        var bisect2 = d3.bisector(function (a, b) {
            return a.x - b.x;
        }).right;
        var virtualIndex = bisect(this.props.controlPoints, this.dragged);
        var virtualIndex2 = bisect2(this.props.controlPoints, this.dragged);
        if (virtualIndex < index) {
            this.props.controlPoints.splice(virtualIndex, 1);
        } else if (virtualIndex > index) {
            this.props.controlPoints.splice(index + 1, 1);
        } else if (virtualIndex2 - index >= 2) {
            this.props.controlPoints.splice(index + 1, 1);
        }
        this._redraw();
    }

    _mouseup() {
        if (!this.dragged) {
            return;
        }
        this.dragged = null;
    }

    _keydown() {
        if (!this.selected) {
            return;
        }
        switch (d3.event.keyCode) {
            case 46:
                { // delete
                    var i = this.props.controlPoints.indexOf(this.selected);
                    this.props.controlPoints.splice(i, 1);
                    this.selected = this.props.controlPoints.length > 0 ? this.props.controlPoints[i > 0 ? i - 1 : 0] : null;
                    this._redraw();
                    break;
                }
        }
    }

    _export() {
        var jsonContent = JSON.stringify(this.props.controlPoints);
        var a = document.createElement("a");
        document.body.appendChild(a);
        a.style = "display: none";
        var blob = new Blob([jsonContent], {
            type: "octet/stream"
        });
        var url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = "transferFunction.json";
        a.click();
        window.URL.revokeObjectURL(url);
    }

    _autoXF() {

        this._channel.lutGenerator_auto();

        this.selected = this.props.controlPoints[0];

        this._redraw();  // this only?
    }

    _auto2XF() {

        this._channel.lutGenerator_auto2();

        this.selected = this.props.controlPoints[0];

        this._redraw();  // this only?
    }

    _bestFitXF() {

        this._channel.lutGenerator_bestFit();

        this.selected = this.props.controlPoints[0];

        this._redraw();  // this only?
    }

    _resetXF() {
        this._channel.lutGenerator_fullRange();

        this.selected = this.props.controlPoints[0];

        this._redraw();  // this only?
    }

    /////// Public API functions ///////

    /**
     * Get the TF output canvas `element`.
     *
     * @return {HTMLElement} canvas 2D with the TF output.
     */
    getCanvas() {
        return this.canvas.current;
    }
    /**
     * Get the output canvas `element` query selector.
     *
     * @return {CSSselector}
     */
    getCanvasSelector() {
        return this.canvasSelector;
    }

    /**
     * TODO: Set the output canvas `element`.
     *
     * @param {HTMLElement} element canvas 2D.
     * @return {bool}
     */
    setCanvas(element) {
        //return this._canvasContext = element.getContext("2d");
    }

    /**
     * Set the pixel data we are manipulating
     *
     * @param {AICSchannel} channel
     */


    setData(index, channel) {
        if (!channel) {
            throw new Error('Transfer Function Editor setData called with no channel data.');
        }
        this._channelIndex = index;
        this._channel = channel;
        this._data = this.props.volumeData;
        this.controlPoints = channel.lutControlPoints;

        this._updateScales();
        this._updateAxis();
        this._redraw();
        this._redrawHistogram();
    }

    /////// Polymer lifecycle callbacks /////////////

    // Initialize elements and perform the drawing of first drawing
    ready() {
        //this.scopeSubtree(this.$.container, true);

        this.createElements();
        // Access the svg dom element
        this.svg = d3.select(this.svgElement.current);
        this._width = +this.svg.attr("width") - this.margin.left - this.margin.right;
        this._height = +this.svg.attr("height") - this.margin.top - this.margin.bottom - 15;
        this._initializeElements();
        this._drawChart();
    }

    connectedCallback() {
        super.connectedCallback();

        //Check for init value in the selectors
        if (this.x3domSelector != '') {
            this._x3domSelectorChanged(this.x3domSelector, '');
        }
        // poor man's alternative to setCapture/releaseCapture
        this.mouseleaveHandler = this._mouseup.bind(this);
        this.$.container.addEventListener("mouseleave", this.mouseleaveHandler);
    }

    disonnectedCallback() {
        super.disconnectedCallback();
        this.$.container.removeEventListener("mouseleave", this.mouseleaveHandler);
    }

    _isCanvasNeeded(canvasSelector) {
        return canvasSelector === '' || canvasSelector === '#canvas-' + this.id;
    }

    // Define Polymer component properties
    static get properties() {
        return {
            /**
             * Unique identifier for the dom element.
             *
             * @type {String}
             */
            id: {
                type: String,
                value: 'tf-1',
            },
            /**
             * Metadata describing a nome for the element (Optional).
             *
             * @type {String}
             */
            name: {
                type: String,
                value: 'TF-Editor',
            },

            /**
             * CSSselector to an ImageTexture node from the X3DOM Framework (Optional).
             *
             * @type {CSSselector}
             */
            x3domSelector: {
                type: String,
                value: '',
                observer: '_x3domSelectorChanged',
            },
            /**
             * Explicit selector to an existent canvas (Optional).
             * The referenced canvas must have a minimun width of 256
             * pixels and 1 pixel height.
             *
             * @type {CSSselector}
             */
            canvasSelector: {
                type: String,
                value: '',
                observer: '_canvasSelectorChanged',
            },
            /**
             * Computed property
             * @type {Boolean}
             */
            _external: {
                type: Boolean,
                computed: '_isCanvasNeeded(canvasSelector)',
            },
            /**
             * Explicit width fot the element (Optional).
             *
             * @type {Number}
             */
            width: {
                type: Number,
                value: 375,
            },
            /**
             * Explicit height fot the element (Optional).
             *
             * @type {Number}
             */
            height: {
                type: Number,
                value: 200,
            },
            /**
             * The number of bins to represent the histogram of the input data.
             *
             * @type {Number}
             */
            numberBins: {
                type: Number,
                value: 256,
            },
            /**
             * The number of ticks to be displayed in the axis.
             *
             * @type {Number}
             */
            numberTicks: {
                type: Number,
                value: 4,
            },
            /**
             * The X axis range is delimited to the input data range.
             * If false, the range will be set by default: [0-255]
             */
            fitToData: {
                type: Boolean,
                value: false,
            },

            /**
             * TF control points.
             *
             * The control points that define the transfer function. User
             * added points will be reflected in the _control-points_
             * attribute. Example:
             *
             *     [{"x":0,"opacity":0,"color":"blue"},
             *      {"x":102.3,"opacity":0.55,"color":"green"},
             *      {"x":255,"opacity":1,"color":"red"}]
             * @type {Array}
             */
            controlPoints: {
                type: Array,
                value: function () {
                    return [];
                },
                reflectToAttribute: true,
                notify: true
            }
        };
    }

    _x3domSelectorChanged(newValue, oldValue) {
        if (newValue != undefined && newValue != "" && newValue != oldValue) {
            var ctx = this;
            var imageObj = new Image();
            imageObj.onload = function () {
                var imageFlattenArray = [];
                var canvas = document.createElement('canvas');
                var context = canvas.getContext('2d');
                context.drawImage(this, 0, 0);
                var imgData = context.getImageData(0, 0, this.width, this.height);
                // NOTE: Flatten the pixel array, we only keep the R channel
                for (var i = 0, n = imgData.data.length; i < n; i += 4) {
                    imageFlattenArray.push(imgData.data[i]);
                }
                ctx.setData(imageFlattenArray);
            };
            //Lookup for the volume data
            var x3dNode = document.querySelector(newValue);
            if (x3dNode != undefined && x3dNode.hasOwnProperty('_x3domNode')) {
                var volumeDataUrl = "";
                // If the provided selector refers to the OpacityMap
                if (x3dNode.localName === "opacitymapvolumestyle" || x3dNode.localName === "blendedvolumestyle") {
                    var parentVolume = null;
                    if (x3dNode.parentNode.localName == "composedvolumestyle") {
                        parentVolume = x3dNode.parentNode.parentNode.querySelector("imagetexture[containerField='transferFunction' i]")
                    } else {
                        parentVolume = x3dNode.parentNode.querySelector("imagetexture[containerField='transferFunction' i]");
                    }
                    if (parentVolume != null) {
                        volumeDataUrl = parentVolume.getAttribute("url");
                    }
                } else if (x3dNode.localName === "volumedata" || x3dNode.localName === "segmentedvolumedata" || x3dNode.localName === "isosurfacevolumedata") {
                    volumeDataUrl = x3dNode.querySelector("imagetextureatlas[containerField='voxels' i]").getAttribute("url");
                } else if (x3dNode.localName === "imagetextureatlas" && x3dNode.getAttribute("containerField").toLowerCase() === "voxels") {
                    volumeDataUrl = x3dNode.getAttribute("url");
                } else {
                    // No volume data node found
                    return;
                }
                // Look for the tranfer funtion texture declaration
                var tfTextureNode = x3dNode.querySelector("imagetexture[containerField='transferFunction' i]");
                if (tfTextureNode != null && tfTextureNode.getAttribute("url") != "") {
                    console.log("WARN: An image texture with a loaded TF founded.");
                } else if (tfTextureNode != null && tfTextureNode.getAttribute("containerField").toLowerCase() === "transferfunction") {
                    if (tfTextureNode.children.length > 0) {
                        tfTextureNode.children[0].setAttribute("id", "tf-canvas-" + this.id);
                    } else {
                        tfTextureNode.setAttribute("hideChildren", "true");
                        var canvas = document.createElement('canvas');
                        canvas.setAttribute("id", "tf-canvas-" + this.id);
                        canvas.setAttribute("width", "256px");
                        canvas.setAttribute("height", "1px");
                        tfTextureNode.append(canvas);
                        setTimeout(function () {
                            x3dom.reload();
                        }, 1000);
                    }
                    this.canvasSelector = "#tf-canvas-" + this.id;
                }

                if (volumeDataUrl == "") {
                    let canvasDataElement = null;
                    // If the volumeDataUrl is empty, check if the volume data is provided as a canvas element
                    if (x3dNode.localName === "imagetextureatlas") {
                        if (x3dNode.children.length > 0) {
                            canvasDataElement = x3dNode.children[0];
                        }
                    } else {
                        let tmp_node = x3dNode.querySelector("imagetextureatlas[containerField='voxels' i]");
                        if (tmp_node != null && tmp_node.children.length > 0) {
                            canvasDataElement = tmp_node.children[0];
                        }
                    }
                    //Get image data from canvas
                    if (canvasDataElement != null) {
                        var imageFlattenArray = [];
                        var context = canvasDataElement.getContext('2d');
                        var imgData = context.getImageData(0, 0, canvasDataElement.width, canvasDataElement.height);
                        var dVal;
                        var maxVal = -Number.MAX_VALUE;
                        // NOTE: Flatten the pixel array, we only keep the R channel
                        for (var i = 0, n = imgData.data.length; i < n; i += 4) {
                            dVal = imgData.data[i];
                            maxVal = Math.max(dVal, maxVal);
                            imageFlattenArray.push(dVal);
                        }
                        if (maxVal == 0) return;
                        this.setData(imageFlattenArray);
                    }
                } else {
                    // The volume data is provided as an image, get it from browser's cache
                    imageObj.src = volumeDataUrl;
                }
            }

            // Redraw the TF in the new canvas element
            this._drawCanvas();
        }
    }

    _canvasSelectorChanged(newValue, oldValue) {
        if (newValue !== '') {
            var newElement = document.querySelector(newValue);
            if (newElement != null && newElement.localName === "canvas") {
                newElement.setAttribute("id", "tf-canvas-" + this.id);
                newElement.setAttribute("width", "256px");
                newElement.setAttribute("height", "5px");
            } else if (newElement != null && newElement.localName != "canvas") {
                this.canvasSelector = oldValue;
            }
            // Redraw the TF in the new canvas element
            this._drawCanvas();
        }
    }

    render () {
        const {
            id,
            width,
            height
        } = this.props;
        return (
            <div id="container">
                <svg id={`svg-${id}`} width={width} height={height} ref={this.svgElement}></svg>
                <div className="aligned">
                        <button id={`export-${id}`} className="ant-btn" onClick={this._export}>Export</button>
                    <button id={`reset-${id}`} className="ant-btn" onClick={this._resetXF}>Reset</button>
                    <button id={`auto-${id}`} className="ant-btn" onClick={this._autoXF}>Auto</button>
                    <button id={`bestfit-${id}`} className="ant-btn" onClick={this._bestFitXF}>BestFit</button>
                    <button id={`auto2-${id}`} className="ant-btn" onClick={this._auto2XF}>Auto_IJ</button>
                    <canvas id={`canvas-${id}`} width="256" height="10" ref={this.canvas}></canvas>
            </div>
            </div>
        )
    }
};
