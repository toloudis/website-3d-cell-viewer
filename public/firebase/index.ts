import { DocumentReference, QueryDocumentSnapshot, QuerySnapshot, DocumentData } from "@firebase/firestore-types";

import { firestore } from "./configure-firebase";

interface DatasetMetaData {
  name: string;
  version: string;
  id: string;
  description: string;
  image: string;
  link?: string;
  manifest?: string;
  production?: boolean;
  userData: {
    isNew: boolean;
    inReview: boolean;
    totalTaggedStructures: number;
    totalCells: number;
    totalFOVs: number;
  };
}

const CELL_ID_KEY = "CellId";
const FOV_ID_KEY = "FOVId";
const CELL_LINE_NAME_KEY = "CellLineName";
const FOV_THUMBNAIL_PATH = "fovThumbnailPath";
const FOV_VOLUME_VIEWER_PATH = "fovVolumeviewerPath";
const THUMBNAIL_PATH = "thumbnailPath";
const VOLUME_VIEWER_PATH = "volumeviewerPath";
const PROTEIN_NAME_KEY = "structureProteinName";
interface FileInfo {
  [CELL_ID_KEY]: string;
  [CELL_LINE_NAME_KEY]: string;
  [FOV_ID_KEY]: string;
  [PROTEIN_NAME_KEY]: string;
  [FOV_THUMBNAIL_PATH]: string;
  [FOV_VOLUME_VIEWER_PATH]: string;
  [THUMBNAIL_PATH]: string;
  [VOLUME_VIEWER_PATH]: string;
}

function isDevOrStagingSite(host: string): boolean {
  // first condition is for testing with no client
  return !host || host.includes("localhost") || host.includes("staging") || host.includes("stg");
}

class FirebaseRequest {
  private collectionRef: DocumentReference;
  private featuresDataPath: string;
  private cellLineDataPath: string;
  private thumbnailRoot: string;
  private downloadRoot: string;
  private volumeViewerDataRoot: string;
  private featuresDisplayOrder: string[];
  private datasetId: string;
  private fileInfoPath: string;
  private featuresDataOrder: string[];
  private albumPath: string;
  private featureDefsPath: string;
  constructor() {
    this.featuresDataPath = "";
    this.cellLineDataPath = "";
    this.thumbnailRoot = "";
    this.downloadRoot = "";
    this.volumeViewerDataRoot = "";
    this.featuresDisplayOrder = [];
    this.fileInfoPath = "";
    this.datasetId = "";
    this.featuresDataOrder = [];
    this.albumPath = "";
    this.featureDefsPath = "";
    this.collectionRef = firestore.collection("cfe-datasets").doc("v1");
  }

  private getDoc = (docPath: string) => {
    return firestore.doc(docPath).get();
  };

  private getCollection = (collection: string) => {
    return firestore.collection(collection).get();
  };

  public getAvailableDatasets = () => {
    return firestore
      .collection("dataset-descriptions")
      .get()
      .then((snapShot: QuerySnapshot) => {
        const datasets: DatasetMetaData[] = [];

        snapShot.forEach((doc) => {
          const metadata = doc.data() as DatasetMetaData;
          /** if running the site in a local development env or on staging.cfe.allencell.org
           * include all cards, otherwise, only include cards with a production flag.
           * this is based on hostname instead of a build time variable so we don't
           * need a separate build for staging and production
           */

          if (isDevOrStagingSite(location.hostname)) {
            datasets.push(metadata);
          } else if (metadata.production) {
            datasets.push(metadata);
          }
        });
        return datasets;
      });
  };

  public setCollectionRef = (id: string) => {
    this.collectionRef = firestore.collection("cfe-datasets").doc(id);
  };

  private getManifest = (ref: string) => {
    return firestore
      .doc(ref)
      .get()
      .then((manifestDoc: DocumentData) => {
        return manifestDoc.data();
      });
  };

  public selectDataset = (ref: string) => {
    return this.getManifest(ref).then((data) => {
      this.featuresDataPath = data.featuresDataPath;
      this.thumbnailRoot = data.thumbnailRoot;
      this.downloadRoot = data.downloadRoot;
      this.volumeViewerDataRoot = data.volumeViewerDataRoot;
      this.featuresDisplayOrder = data.featuresDisplayOrder;
      this.cellLineDataPath = data.cellLineDataPath;
      this.fileInfoPath = data.fileInfoPath;
      this.featuresDataOrder = data.featuresDataOrder;
      this.featureDefsPath = data.featureDefsPath;
      this.albumPath = data.albumPath;
      return {
        defaultXAxis: data.defaultXAxis,
        defaultYAxis: data.defaultYAxis,
        thumbnailRoot: data.thumbnailRoot,
        downloadRoot: data.downloadRoot,
        volumeViewerDataRoot: data.volumeViewerDataRoot,
      };
    });
  };

  public getFileInfoByCellId = (cellId: string) => {
    return this.getDoc(`${this.fileInfoPath}/${cellId}`).then((doc) => {
      const data = doc.data() as FileInfo;
      if (!data) {
        return;
      }
      return {
        ...data,
        CellId: data.CellId.toString(),
        FOVId: data.FOVId.toString(),
      };
    });
  };

  public getFileInfoByArrayOfCellIds = (cellIds: string[]) => {
    return Promise.all(
      cellIds.map((id: string) => {
        return this.getDoc(`${this.fileInfoPath}/${id}`).then((doc) => {
          const data = doc.data() as FileInfo;
          if (!data) {
            return;
          }
          return {
            ...data,
            CellId: data.CellId.toString(),
            FOVId: data.FOVId.toString(),
          };
        });
      })
    );
  };
}

export default FirebaseRequest;
