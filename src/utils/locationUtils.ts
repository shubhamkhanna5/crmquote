import { Quotation, Client } from '../types';

/**
 * Common Indian cities / regions mapped to standardized region labels
 */
const CITY_KEYWORDS: Array<{ keywords: string[]; label: string }> = [
  {
    label: 'Delhi NCR',
    keywords: [
      'delhi',
      'ncr',
      'gurgaon',
      'gurugram',
      'noida',
      'greater noida',
      'ghaziabad',
      'faridabad',
      'manesar',
      'sonipat',
      'dwarka',
      'saket',
      'vasant',
      'chhatarpur',
      'sainik farm',
    ],
  },
  {
    label: 'Mumbai',
    keywords: [
      'mumbai',
      'bombay',
      'navi mumbai',
      'thane',
      'bandra',
      'andheri',
      'juhu',
      'worli',
      'borivali',
      'powai',
      'malad',
      'goregaon',
      'colaba',
      'dharavi',
    ],
  },
  {
    label: 'Maharashtra',
    keywords: [
      'maharashtra',
      'mumbai',
      'bombay',
      'pune',
      'nagpur',
      'nashik',
      'aurangabad',
      'chhatrapati sambhajinagar',
      'thane',
      'navi mumbai',
      'solapur',
      'kolhapur',
      'alibaug',
      'alibag',
      'lonavala',
      'khandala',
      'mahabaleshwar',
      'satara',
      'panvel',
      'kalyan',
      'dombivli',
      'vasai',
      'virar',
      'chembur',
      'dadar',
      'andheri',
      'bandra',
    ],
  },
  {
    label: 'Goa',
    keywords: [
      'goa',
      'panaji',
      'panjim',
      'margao',
      'madgaon',
      'vasco',
      'mapusa',
      'ponda',
      'candolim',
      'calangute',
      'baga',
      'anjuna',
      'vagator',
      'morjim',
      'ashwem',
      'arambol',
      'porvorim',
      'colva',
      'benaulim',
      'palolem',
    ],
  },
  {
    label: 'Karnataka',
    keywords: [
      'karnataka',
      'gokarna',
      'bangalore',
      'bengaluru',
      'mysore',
      'mysuru',
      'mangalore',
      'mangaluru',
      'hubli',
      'hubballi',
      'dharwad',
      'belgaum',
      'belagavi',
      'udupi',
      'manipal',
      'coorg',
      'kodagu',
      'madikeri',
      'hampi',
      'hospet',
      'bellary',
      'ballari',
      'shimoga',
      'shivamogga',
      'davangere',
      'davanagere',
      'gulbarga',
      'kalaburagi',
      'tumkur',
      'tumakuru',
      'bidar',
      'bijapur',
      'vijayapura',
      'raichur',
      'chitradurga',
      'karwar',
      'chikmagalur',
      'chikkamagaluru',
      'kolar',
      'mandya',
      'whitefield',
      'koramangala',
      'indiranagar',
      'sarjapur',
      'electronic city',
      'yelahanka',
      'hebbal',
      'jayanagar',
    ],
  },
  {
    label: 'Telangana',
    keywords: [
      'telangana',
      'hyderabad',
      'secunderabad',
      'cyberabad',
      'gachibowli',
      'jubilee hills',
      'banjara hills',
      'madhapur',
      'kondapur',
      'warangal',
      'nizamabad',
      'karimnagar',
    ],
  },
  {
    label: 'Tamil Nadu',
    keywords: [
      'tamil nadu',
      'tamilnadu',
      'chennai',
      'madras',
      'coimbatore',
      'madurai',
      'ecr',
      'omr',
      'salem',
      'trichy',
      'tiruppur',
      'tirunelveli',
      'vellore',
      'erode',
    ],
  },
  {
    label: 'Rajasthan',
    keywords: [
      'rajasthan',
      'jaipur',
      'udaipur',
      'jodhpur',
      'ajmer',
      'kota',
      'bhiwadi',
      'neemrana',
      'pushkar',
      'alwar',
      'bikaner',
      'bhilwara',
      'jaisalmer',
    ],
  },
  {
    label: 'Gujarat',
    keywords: [
      'gujarat',
      'ahmedabad',
      'surat',
      'vadodara',
      'baroda',
      'rajkot',
      'gandhinagar',
      'bhavnagar',
      'vapi',
      'valsad',
      'jamnagar',
      'junagadh',
      'anand',
    ],
  },
  {
    label: 'Punjab / Chandigarh',
    keywords: [
      'punjab',
      'chandigarh',
      'mohali',
      'panchkula',
      'ludhiana',
      'amritsar',
      'jalandhar',
      'patiala',
      'zirakpur',
      'bathinda',
      'pathankot',
    ],
  },
  {
    label: 'Uttar Pradesh',
    keywords: [
      'uttar pradesh',
      'lucknow',
      'kanpur',
      'varanasi',
      'banaras',
      'kashi',
      'agra',
      'meerut',
      'prayagraj',
      'allahabad',
      'bareilly',
      'ayodhya',
      'gorakhpur',
      'aligarh',
      'mathura',
      'vrindavan',
    ],
  },
  {
    label: 'West Bengal',
    keywords: [
      'west bengal',
      'bengal',
      'kolkata',
      'calcutta',
      'howrah',
      'salt lake',
      'new town',
      'siliguri',
      'durgapur',
      'asansol',
      'darjeeling',
    ],
  },
  {
    label: 'Uttarakhand',
    keywords: [
      'uttarakhand',
      'dehradun',
      'rishikesh',
      'haridwar',
      'mussoorie',
      'nainital',
      'haldwani',
      'roorkee',
      'rudrapur',
    ],
  },
  {
    label: 'Himachal Pradesh',
    keywords: ['himachal pradesh', 'himachal', 'shimla', 'manali', 'kasauli', 'dharamshala', 'solan', 'kullu', 'mandi'],
  },
  {
    label: 'Kerala',
    keywords: [
      'kerala',
      'kochi',
      'cochin',
      'trivandrum',
      'thiruvananthapuram',
      'calicut',
      'kozhikode',
      'wayanad',
      'kottayam',
      'munnar',
      'thrissur',
      'alleppey',
      'alappuzha',
    ],
  },
  {
    label: 'Andhra Pradesh',
    keywords: ['andhra pradesh', 'andhra', 'visakhapatnam', 'vizag', 'vijayawada', 'guntur', 'tirupati', 'nellore', 'kurnool'],
  },
  {
    label: 'Madhya Pradesh',
    keywords: ['madhya pradesh', 'indore', 'bhopal', 'jabalpur', 'gwalior', 'ujjain'],
  },
  {
    label: 'Assam / Northeast',
    keywords: ['guwahati', 'assam', 'shillong', 'dimapur', 'imphal', 'agartala'],
  },
];

/**
 * Standard Indian Telecom Circles prefix mappings (DoT Mobile Series Allocation)
 */
const PHONE_PREFIX_MAP: Record<string, string> = {
  // Delhi NCR
  '9810': 'Delhi NCR',
  '9811': 'Delhi NCR',
  '9818': 'Delhi NCR',
  '9899': 'Delhi NCR',
  '9910': 'Delhi NCR',
  '9971': 'Delhi NCR',
  '9990': 'Delhi NCR',
  '9999': 'Delhi NCR',
  '9871': 'Delhi NCR',
  '9873': 'Delhi NCR',
  '9310': 'Delhi NCR',
  '9311': 'Delhi NCR',
  '9312': 'Delhi NCR',
  '9313': 'Delhi NCR',
  '9212': 'Delhi NCR',
  '9213': 'Delhi NCR',
  '9711': 'Delhi NCR',
  '9717': 'Delhi NCR',
  '9718': 'Delhi NCR',
  '9650': 'Delhi NCR',
  '9654': 'Delhi NCR',
  '8800': 'Delhi NCR',
  '8826': 'Delhi NCR',
  '8527': 'Delhi NCR',
  '8588': 'Delhi NCR',
  '8447': 'Delhi NCR',
  '8448': 'Delhi NCR',
  '8377': 'Delhi NCR',
  '8130': 'Delhi NCR',
  '8010': 'Delhi NCR',

  // Mumbai
  '9820': 'Mumbai',
  '9821': 'Mumbai',
  '9819': 'Mumbai',
  '9833': 'Mumbai',
  '9869': 'Mumbai',
  '9892': 'Mumbai',
  '9920': 'Mumbai',
  '9930': 'Mumbai',
  '9969': 'Mumbai',
  '9987': 'Mumbai',
  '9769': 'Mumbai',
  '9702': 'Mumbai',
  '9619': 'Mumbai',
  '9664': 'Mumbai',
  '9167': 'Mumbai',
  '9029': 'Mumbai',
  '9004': 'Mumbai',
  '8879': 'Mumbai',
  '8652': 'Mumbai',
  '8655': 'Mumbai',
  '8451': 'Mumbai',
  '8452': 'Mumbai',
  '8454': 'Mumbai',
  '8291': 'Mumbai',
  '8108': 'Mumbai',
  '8591': 'Mumbai',

  // Maharashtra & Goa
  '9822': 'Maharashtra & Goa',
  '9823': 'Maharashtra & Goa',
  '9850': 'Maharashtra & Goa',
  '9860': 'Maharashtra & Goa',
  '9881': 'Maharashtra & Goa',
  '9890': 'Maharashtra & Goa',
  '9921': 'Maharashtra & Goa',
  '9922': 'Maharashtra & Goa',
  '9923': 'Maharashtra & Goa',
  '9960': 'Maharashtra & Goa',
  '9970': 'Maharashtra & Goa',
  '9975': 'Maharashtra & Goa',
  '9604': 'Maharashtra & Goa',
  '9637': 'Maharashtra & Goa',
  '9762': 'Maharashtra & Goa',
  '9763': 'Maharashtra & Goa',
  '9764': 'Maharashtra & Goa',
  '9765': 'Maharashtra & Goa',
  '9766': 'Maharashtra & Goa',
  '9767': 'Maharashtra & Goa',
  '8446': 'Maharashtra & Goa',
  '8007': 'Maharashtra & Goa',
  '8380': 'Maharashtra & Goa',
  '8390': 'Maharashtra & Goa',
  '8888': 'Maharashtra & Goa',
  '9158': 'Maharashtra & Goa',
  '9011': 'Maharashtra & Goa',
  '9028': 'Maharashtra & Goa',
  '9049': 'Maharashtra & Goa',
  '9096': 'Maharashtra & Goa',
  '9130': 'Maharashtra & Goa',
  '9145': 'Maharashtra & Goa',
  '9146': 'Maharashtra & Goa',
  '9175': 'Maharashtra & Goa',

  // Bangalore / Karnataka
  '9845': 'Bangalore / Karnataka',
  '9880': 'Bangalore / Karnataka',
  '9886': 'Bangalore / Karnataka',
  '9900': 'Bangalore / Karnataka',
  '9901': 'Bangalore / Karnataka',
  '9902': 'Bangalore / Karnataka',
  '9945': 'Bangalore / Karnataka',
  '9972': 'Bangalore / Karnataka',
  '9980': 'Bangalore / Karnataka',
  '9986': 'Bangalore / Karnataka',
  '9731': 'Bangalore / Karnataka',
  '9739': 'Bangalore / Karnataka',
  '9740': 'Bangalore / Karnataka',
  '9741': 'Bangalore / Karnataka',
  '9742': 'Bangalore / Karnataka',
  '9743': 'Bangalore / Karnataka',
  '9611': 'Bangalore / Karnataka',
  '9620': 'Bangalore / Karnataka',
  '9632': 'Bangalore / Karnataka',
  '9663': 'Bangalore / Karnataka',
  '9686': 'Bangalore / Karnataka',
  '8884': 'Bangalore / Karnataka',
  '8892': 'Bangalore / Karnataka',
  '8970': 'Bangalore / Karnataka',
  '8971': 'Bangalore / Karnataka',
  '8050': 'Bangalore / Karnataka',
  '8088': 'Bangalore / Karnataka',
  '8095': 'Bangalore / Karnataka',
  '8105': 'Bangalore / Karnataka',
  '8123': 'Bangalore / Karnataka',
  '8147': 'Bangalore / Karnataka',
  '8197': 'Bangalore / Karnataka',
  '8277': 'Bangalore / Karnataka',
  '8296': 'Bangalore / Karnataka',
  '9538': 'Bangalore / Karnataka',

  // Tamil Nadu / Chennai
  '9840': 'Tamil Nadu / Chennai',
  '9841': 'Tamil Nadu / Chennai',
  '9884': 'Tamil Nadu / Chennai',
  '9940': 'Tamil Nadu / Chennai',
  '9941': 'Tamil Nadu / Chennai',
  '9952': 'Tamil Nadu / Chennai',
  '9962': 'Tamil Nadu / Chennai',
  '9789': 'Tamil Nadu / Chennai',
  '9790': 'Tamil Nadu / Chennai',
  '9791': 'Tamil Nadu / Chennai',
  '9710': 'Tamil Nadu / Chennai',
  '9600': 'Tamil Nadu / Chennai',
  '9677': 'Tamil Nadu / Chennai',
  '9486': 'Tamil Nadu / Chennai',
  '9444': 'Tamil Nadu / Chennai',
  '9445': 'Tamil Nadu / Chennai',
  '9442': 'Tamil Nadu / Chennai',
  '9443': 'Tamil Nadu / Chennai',

  // Hyderabad / Telangana
  '9848': 'Hyderabad / Telangana',
  '9849': 'Hyderabad / Telangana',
  '9866': 'Hyderabad / Telangana',
  '9885': 'Hyderabad / Telangana',
  '9908': 'Hyderabad / Telangana',
  '9912': 'Hyderabad / Telangana',
  '9948': 'Hyderabad / Telangana',
  '9949': 'Hyderabad / Telangana',
  '9951': 'Hyderabad / Telangana',
  '9959': 'Hyderabad / Telangana',
  '9963': 'Hyderabad / Telangana',
  '9966': 'Hyderabad / Telangana',
  '9985': 'Hyderabad / Telangana',
  '9989': 'Hyderabad / Telangana',
  '9701': 'Hyderabad / Telangana',
  '9703': 'Hyderabad / Telangana',
  '9704': 'Hyderabad / Telangana',
  '9705': 'Hyderabad / Telangana',
  '9603': 'Hyderabad / Telangana',
  '9618': 'Hyderabad / Telangana',
  '9640': 'Hyderabad / Telangana',
  '9642': 'Hyderabad / Telangana',
  '9652': 'Hyderabad / Telangana',
  '9666': 'Hyderabad / Telangana',
  '9676': 'Hyderabad / Telangana',
  '8978': 'Hyderabad / Telangana',
  '8985': 'Hyderabad / Telangana',
  '9000': 'Hyderabad / Telangana',
  '9010': 'Hyderabad / Telangana',
  '9030': 'Hyderabad / Telangana',
  '9032': 'Hyderabad / Telangana',
  '9052': 'Hyderabad / Telangana',
  '9160': 'Hyderabad / Telangana',
  '9177': 'Hyderabad / Telangana',
  '9502': 'Hyderabad / Telangana',
  '9505': 'Hyderabad / Telangana',
  '9550': 'Hyderabad / Telangana',
  '9553': 'Hyderabad / Telangana',
  '9573': 'Hyderabad / Telangana',
  '9581': 'Hyderabad / Telangana',

  // Rajasthan / Jaipur
  '9828': 'Rajasthan / Jaipur',
  '9829': 'Rajasthan / Jaipur',
  '9887': 'Rajasthan / Jaipur',
  '9928': 'Rajasthan / Jaipur',
  '9929': 'Rajasthan / Jaipur',
  '9950': 'Rajasthan / Jaipur',
  '9982': 'Rajasthan / Jaipur',
  '9983': 'Rajasthan / Jaipur',
  '9782': 'Rajasthan / Jaipur',
  '9783': 'Rajasthan / Jaipur',
  '9784': 'Rajasthan / Jaipur',
  '9785': 'Rajasthan / Jaipur',
  '9799': 'Rajasthan / Jaipur',
  '9602': 'Rajasthan / Jaipur',
  '9610': 'Rajasthan / Jaipur',
  '9636': 'Rajasthan / Jaipur',
  '9649': 'Rajasthan / Jaipur',
  '9660': 'Rajasthan / Jaipur',
  '9667': 'Rajasthan / Jaipur',
  '9672': 'Rajasthan / Jaipur',
  '9680': 'Rajasthan / Jaipur',
  '9694': 'Rajasthan / Jaipur',
  '9772': 'Rajasthan / Jaipur',
  '8003': 'Rajasthan / Jaipur',
  '8005': 'Rajasthan / Jaipur',
  '8094': 'Rajasthan / Jaipur',
  '8104': 'Rajasthan / Jaipur',
  '8107': 'Rajasthan / Jaipur',
  '8233': 'Rajasthan / Jaipur',
  '8239': 'Rajasthan / Jaipur',
  '8290': 'Rajasthan / Jaipur',
  '8824': 'Rajasthan / Jaipur',
  '8875': 'Rajasthan / Jaipur',
  '8890': 'Rajasthan / Jaipur',
  '8946': 'Rajasthan / Jaipur',
  '8947': 'Rajasthan / Jaipur',
  '8952': 'Rajasthan / Jaipur',
  '8955': 'Rajasthan / Jaipur',
  '9001': 'Rajasthan / Jaipur',
  '9024': 'Rajasthan / Jaipur',
  '9057': 'Rajasthan / Jaipur',
  '9116': 'Rajasthan / Jaipur',
  '9119': 'Rajasthan / Jaipur',
  '9166': 'Rajasthan / Jaipur',
  '9413': 'Rajasthan / Jaipur',
  '9414': 'Rajasthan / Jaipur',
  '9460': 'Rajasthan / Jaipur',
  '9461': 'Rajasthan / Jaipur',
  '9462': 'Rajasthan / Jaipur',

  // Gujarat
  '9824': 'Gujarat',
  '9825': 'Gujarat',
  '9879': 'Gujarat',
  '9898': 'Gujarat',
  '9904': 'Gujarat',
  '9909': 'Gujarat',
  '9913': 'Gujarat',
  '9924': 'Gujarat',
  '9925': 'Gujarat',
  '9974': 'Gujarat',
  '9978': 'Gujarat',
  '9979': 'Gujarat',
  '9998': 'Gujarat',
  '9712': 'Gujarat',
  '9714': 'Gujarat',
  '9722': 'Gujarat',
  '9723': 'Gujarat',
  '9724': 'Gujarat',
  '9725': 'Gujarat',
  '9726': 'Gujarat',
  '9727': 'Gujarat',
  '9737': 'Gujarat',
  '9601': 'Gujarat',
  '9624': 'Gujarat',
  '9638': 'Gujarat',
  '9662': 'Gujarat',
  '9687': 'Gujarat',
  '8000': 'Gujarat',
  '8128': 'Gujarat',
  '8140': 'Gujarat',
  '8141': 'Gujarat',
  '8153': 'Gujarat',
  '8154': 'Gujarat',
  '8155': 'Gujarat',
  '8156': 'Gujarat',
  '8160': 'Gujarat',
  '8200': 'Gujarat',
  '8238': 'Gujarat',
  '8320': 'Gujarat',
  '8347': 'Gujarat',
  '8401': 'Gujarat',
  '8460': 'Gujarat',
  '8469': 'Gujarat',
  '8487': 'Gujarat',
  '8488': 'Gujarat',
  '8511': 'Gujarat',
  '8732': 'Gujarat',
  '8733': 'Gujarat',
  '8734': 'Gujarat',
  '8735': 'Gujarat',
  '8758': 'Gujarat',
  '8849': 'Gujarat',
  '8866': 'Gujarat',
  '8905': 'Gujarat',
  '8980': 'Gujarat',

  // Punjab / Chandigarh
  '9814': 'Punjab / Chandigarh',
  '9815': 'Punjab / Chandigarh',
  '9855': 'Punjab / Chandigarh',
  '9872': 'Punjab / Chandigarh',
  '9876': 'Punjab / Chandigarh',
  '9878': 'Punjab / Chandigarh',
  '9888': 'Punjab / Chandigarh',
  '9914': 'Punjab / Chandigarh',
  '9915': 'Punjab / Chandigarh',
  '9988': 'Punjab / Chandigarh',
  '9779': 'Punjab / Chandigarh',
  '9780': 'Punjab / Chandigarh',
  '9781': 'Punjab / Chandigarh',
  '9646': 'Punjab / Chandigarh',
  '9653': 'Punjab / Chandigarh',
  '8054': 'Punjab / Chandigarh',
  '8146': 'Punjab / Chandigarh',
  '8194': 'Punjab / Chandigarh',
  '8195': 'Punjab / Chandigarh',
  '8196': 'Punjab / Chandigarh',
  '8198': 'Punjab / Chandigarh',
  '8283': 'Punjab / Chandigarh',
  '8284': 'Punjab / Chandigarh',
  '8288': 'Punjab / Chandigarh',
  '8427': 'Punjab / Chandigarh',
  '8437': 'Punjab / Chandigarh',
  '8528': 'Punjab / Chandigarh',
  '8556': 'Punjab / Chandigarh',
  '8557': 'Punjab / Chandigarh',
  '8558': 'Punjab / Chandigarh',
  '8559': 'Punjab / Chandigarh',
  '8566': 'Punjab / Chandigarh',
  '8567': 'Punjab / Chandigarh',
  '8568': 'Punjab / Chandigarh',
  '8569': 'Punjab / Chandigarh',
  '8699': 'Punjab / Chandigarh',
  '8725': 'Punjab / Chandigarh',
  '8727': 'Punjab / Chandigarh',
  '8728': 'Punjab / Chandigarh',
  '8729': 'Punjab / Chandigarh',
  '8847': 'Punjab / Chandigarh',
  '8872': 'Punjab / Chandigarh',
  '8968': 'Punjab / Chandigarh',
  '9023': 'Punjab / Chandigarh',
  '9041': 'Punjab / Chandigarh',
  '9056': 'Punjab / Chandigarh',
  '9115': 'Punjab / Chandigarh',
  '9417': 'Punjab / Chandigarh',
  '9463': 'Punjab / Chandigarh',
  '9464': 'Punjab / Chandigarh',
  '9465': 'Punjab / Chandigarh',

  // Uttar Pradesh
  '9838': 'Uttar Pradesh',
  '9839': 'Uttar Pradesh',
  '9889': 'Uttar Pradesh',
  '9918': 'Uttar Pradesh',
  '9919': 'Uttar Pradesh',
  '9935': 'Uttar Pradesh',
  '9936': 'Uttar Pradesh',
  '9956': 'Uttar Pradesh',
  '9984': 'Uttar Pradesh',
  '9792': 'Uttar Pradesh',
  '9793': 'Uttar Pradesh',
  '9794': 'Uttar Pradesh',
  '9795': 'Uttar Pradesh',
  '9616': 'Uttar Pradesh',
  '9621': 'Uttar Pradesh',
  '9628': 'Uttar Pradesh',
  '9648': 'Uttar Pradesh',
  '9651': 'Uttar Pradesh',
  '9670': 'Uttar Pradesh',
  '9695': 'Uttar Pradesh',
  '9696': 'Uttar Pradesh',
  '8004': 'Uttar Pradesh',
  '8009': 'Uttar Pradesh',
  '8052': 'Uttar Pradesh',
  '8090': 'Uttar Pradesh',
  '8115': 'Uttar Pradesh',
  '8127': 'Uttar Pradesh',
  '8172': 'Uttar Pradesh',
  '8173': 'Uttar Pradesh',
  '8174': 'Uttar Pradesh',
  '8175': 'Uttar Pradesh',
  '8176': 'Uttar Pradesh',
  '8181': 'Uttar Pradesh',
  '8182': 'Uttar Pradesh',
  '8188': 'Uttar Pradesh',
  '8189': 'Uttar Pradesh',
  '8191': 'Uttar Pradesh',
  '8192': 'Uttar Pradesh',
  '8193': 'Uttar Pradesh',
  '8299': 'Uttar Pradesh',
  '8318': 'Uttar Pradesh',
  '8353': 'Uttar Pradesh',
  '8354': 'Uttar Pradesh',
  '8355': 'Uttar Pradesh',
  '8381': 'Uttar Pradesh',
  '8382': 'Uttar Pradesh',
  '8400': 'Uttar Pradesh',
  '8416': 'Uttar Pradesh',
  '8417': 'Uttar Pradesh',
  '8418': 'Uttar Pradesh',
  '8419': 'Uttar Pradesh',
  '8423': 'Uttar Pradesh',
  '8429': 'Uttar Pradesh',
  '8542': 'Uttar Pradesh',
  '8543': 'Uttar Pradesh',
  '8545': 'Uttar Pradesh',
  '8573': 'Uttar Pradesh',
  '8574': 'Uttar Pradesh',
  '8576': 'Uttar Pradesh',
  '8577': 'Uttar Pradesh',
  '8601': 'Uttar Pradesh',
  '8604': 'Uttar Pradesh',
  '8707': 'Uttar Pradesh',
  '8726': 'Uttar Pradesh',
  '8736': 'Uttar Pradesh',
  '8737': 'Uttar Pradesh',
  '8738': 'Uttar Pradesh',
  '8739': 'Uttar Pradesh',
  '8756': 'Uttar Pradesh',
  '8765': 'Uttar Pradesh',
  '8795': 'Uttar Pradesh',
  '8808': 'Uttar Pradesh',
  '8840': 'Uttar Pradesh',
  '8853': 'Uttar Pradesh',
  '8858': 'Uttar Pradesh',
  '8874': 'Uttar Pradesh',
  '8887': 'Uttar Pradesh',
  '8896': 'Uttar Pradesh',
  '8922': 'Uttar Pradesh',
  '8924': 'Uttar Pradesh',
  '8931': 'Uttar Pradesh',
  '8932': 'Uttar Pradesh',
  '8933': 'Uttar Pradesh',
  '8934': 'Uttar Pradesh',
  '8935': 'Uttar Pradesh',
  '8948': 'Uttar Pradesh',
  '8953': 'Uttar Pradesh',
  '8957': 'Uttar Pradesh',
  '8960': 'Uttar Pradesh',
  '9005': 'Uttar Pradesh',
  '9026': 'Uttar Pradesh',
  '9044': 'Uttar Pradesh',
  '9125': 'Uttar Pradesh',
  '9129': 'Uttar Pradesh',
  '9140': 'Uttar Pradesh',
  '9151': 'Uttar Pradesh',
  '9161': 'Uttar Pradesh',
  '9169': 'Uttar Pradesh',
  '9198': 'Uttar Pradesh',
  '9415': 'Uttar Pradesh',
  '9450': 'Uttar Pradesh',
  '9451': 'Uttar Pradesh',
  '9452': 'Uttar Pradesh',
  '9453': 'Uttar Pradesh',
  '9454': 'Uttar Pradesh',
  '9455': 'Uttar Pradesh',

  // Kolkata / West Bengal
  '9830': 'Kolkata / West Bengal',
  '9831': 'Kolkata / West Bengal',
  '9832': 'Kolkata / West Bengal',
  '9836': 'Kolkata / West Bengal',
  '9874': 'Kolkata / West Bengal',
  '9903': 'Kolkata / West Bengal',
  '9748': 'Kolkata / West Bengal',
  '9674': 'Kolkata / West Bengal',
  '9051': 'Kolkata / West Bengal',
  '9007': 'Kolkata / West Bengal',
  '8981': 'Kolkata / West Bengal',
  '8961': 'Kolkata / West Bengal',
  '8697': 'Kolkata / West Bengal',
  '8584': 'Kolkata / West Bengal',
  '8583': 'Kolkata / West Bengal',
  '8582': 'Kolkata / West Bengal',
  '8420': 'Kolkata / West Bengal',
  '8336': 'Kolkata / West Bengal',
  '8335': 'Kolkata / West Bengal',
  '8334': 'Kolkata / West Bengal',
  '8100': 'Kolkata / West Bengal',
  '8017': 'Kolkata / West Bengal',
  '8013': 'Kolkata / West Bengal',

  // Assam / Northeast
  '9401': 'Assam / Northeast',
  '9435': 'Assam / Northeast',
  '9864': 'Assam / Northeast',
  '9854': 'Assam / Northeast',
  '9954': 'Assam / Northeast',
  '9957': 'Assam / Northeast',
  '9706': 'Assam / Northeast',
  '9678': 'Assam / Northeast',
  '8876': 'Assam / Northeast',
  '8811': 'Assam / Northeast',
  '8812': 'Assam / Northeast',
  '8822': 'Assam / Northeast',
  '8011': 'Assam / Northeast',
  '8486': 'Assam / Northeast',
  '8473': 'Assam / Northeast',
  '8472': 'Assam / Northeast',
  '8471': 'Assam / Northeast',

  // Kerala
  '9846': 'Kerala',
  '9847': 'Kerala',
  '9895': 'Kerala',
  '9946': 'Kerala',
  '9947': 'Kerala',
  '9961': 'Kerala',
  '9995': 'Kerala',
  '9744': 'Kerala',
  '9745': 'Kerala',
  '9746': 'Kerala',
  '9747': 'Kerala',
  '9605': 'Kerala',
  '9633': 'Kerala',
  '9645': 'Kerala',
  '9656': 'Kerala',
  '8086': 'Kerala',
  '8089': 'Kerala',
  '8111': 'Kerala',
  '8113': 'Kerala',
  '8129': 'Kerala',
  '8136': 'Kerala',
  '8137': 'Kerala',
  '8138': 'Kerala',
  '8139': 'Kerala',
  '8157': 'Kerala',
  '8281': 'Kerala',
  '8547': 'Kerala',
  '8589': 'Kerala',
  '8590': 'Kerala',
  '8592': 'Kerala',
  '8593': 'Kerala',
  '8594': 'Kerala',
  '8921': 'Kerala',
  '8943': 'Kerala',
  '9048': 'Kerala',
  '9061': 'Kerala',
  '9072': 'Kerala',
  '9074': 'Kerala',
  '9446': 'Kerala',
  '9447': 'Kerala',
  '9495': 'Kerala',
  '9496': 'Kerala',
  '9497': 'Kerala',
};

/**
 * Infer location from text (notes, client name, pool specs)
 */
export function inferLocationFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const entry of CITY_KEYWORDS) {
    for (const kw of entry.keywords) {
      // Word boundary match
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(lower)) {
        return entry.label;
      }
    }
  }
  return null;
}

/**
 * Infer location from Indian phone number (10-digit mobile)
 */
export function inferLocationFromPhone(phoneStr: string | null | undefined): string | null {
  if (!phoneStr) return null;
  const digits = phoneStr.replace(/\D/g, '');
  // Extract 10-digit mobile
  const tenDigit = digits.length >= 10 ? digits.slice(-10) : digits;
  if (tenDigit.length === 10) {
    const prefix4 = tenDigit.slice(0, 4);
    if (PHONE_PREFIX_MAP[prefix4]) {
      return PHONE_PREFIX_MAP[prefix4];
    }
    const prefix3 = tenDigit.slice(0, 3);
    // Secondary check for prefixes
    for (const [key, loc] of Object.entries(PHONE_PREFIX_MAP)) {
      if (key.startsWith(prefix3)) {
        return loc;
      }
    }
  }
  return null;
}

/**
 * Resolves the most accurate location for a quotation:
 * 1. Explicit quotation.location
 * 2. Explicit client.location
 * 3. Inferred from internal_notes or client_name
 * 4. Inferred from phone circle
 * 5. Returns 'Other' if unresolved
 */
export function getQuotationLocation(
  quotation:
    | Quotation
    | {
        location?: string | null;
        client_id?: string;
        client_name?: string;
        internal_notes?: string | null;
        contact_number?: string;
        contact_number_raw?: string;
      },
  clients?: Client[]
): string {
  if (quotation.location && quotation.location.trim()) {
    return quotation.location.trim();
  }

  // Linked client location
  if (clients && clients.length > 0) {
    const matchedClient = clients.find(
      (c) =>
        c.id === quotation.client_id ||
        (c.name && quotation.client_name && c.name.toLowerCase() === quotation.client_name.toLowerCase())
    );
    if (matchedClient?.location && matchedClient.location.trim()) {
      return matchedClient.location.trim();
    }
  }

  // Inferred from notes
  const textInferred =
    inferLocationFromText(quotation.internal_notes) ||
    inferLocationFromText(quotation.client_name);
  if (textInferred) {
    return textInferred;
  }

  // Inferred from phone
  const phoneInferred =
    inferLocationFromPhone(quotation.contact_number_raw) ||
    inferLocationFromPhone(quotation.contact_number);
  if (phoneInferred) {
    return phoneInferred;
  }

  return 'Other';
}

/**
 * Resolves location for a client
 */
export function getClientLocation(
  client: Client,
  quotations?: Quotation[]
): string {
  if (client.location && client.location.trim()) {
    return client.location.trim();
  }

  // Check if client notes contain location
  const notesInferred =
    inferLocationFromText(client.notes) ||
    inferLocationFromText(client.name);
  if (notesInferred) {
    return notesInferred;
  }

  // Check linked quotation
  if (quotations && quotations.length > 0) {
    const linkedQuote = quotations.find(
      (q) => q.client_id === client.id || q.client_name.toLowerCase() === client.name.toLowerCase()
    );
    if (linkedQuote) {
      if (linkedQuote.location && linkedQuote.location.trim()) {
        return linkedQuote.location.trim();
      }
      const quoteNotesInferred = inferLocationFromText(linkedQuote.internal_notes);
      if (quoteNotesInferred) return quoteNotesInferred;
    }
  }

  // Inferred from phone
  const phoneInferred =
    inferLocationFromPhone(client.contact_number_raw) ||
    inferLocationFromPhone(client.phone);
  if (phoneInferred) {
    return phoneInferred;
  }

  return 'Other';
}

/**
 * Indian State matching map to detect States from city names, state names, or mixed text
 * e.g. "Gokarna, Karnataka" -> "Karnataka"
 *      "Gokarna" -> "Karnataka"
 *      "Bangalore" -> "Karnataka"
 */
export const STATE_DIRECT_MAP: Array<{ state: string; matches: string[] }> = [
  {
    state: 'Karnataka',
    matches: [
      'karnataka',
      'gokarna',
      'bangalore',
      'bengaluru',
      'mysore',
      'mysuru',
      'mangalore',
      'mangaluru',
      'hubli',
      'hubballi',
      'dharwad',
      'belgaum',
      'belagavi',
      'udupi',
      'manipal',
      'coorg',
      'kodagu',
      'madikeri',
      'hampi',
      'hospet',
      'bellary',
      'ballari',
      'shimoga',
      'shivamogga',
      'davangere',
      'davanagere',
      'gulbarga',
      'kalaburagi',
      'tumkur',
      'tumakuru',
      'karwar',
      'chikmagalur',
      'chikkamagaluru',
      'kolar',
      'whitefield',
      'koramangala',
      'indiranagar',
      'sarjapur',
      'electronic city',
      'yelahanka',
    ],
  },
  {
    state: 'Maharashtra',
    matches: [
      'maharashtra',
      'mumbai',
      'bombay',
      'pune',
      'nagpur',
      'nashik',
      'aurangabad',
      'chhatrapati sambhajinagar',
      'thane',
      'navi mumbai',
      'solapur',
      'kolhapur',
      'alibaug',
      'alibag',
      'lonavala',
      'khandala',
      'mahabaleshwar',
      'satara',
      'panvel',
      'kalyan',
      'andheri',
      'bandra',
      'worli',
      'juhu',
      'powai',
    ],
  },
  {
    state: 'Goa',
    matches: [
      'goa',
      'panaji',
      'panjim',
      'margao',
      'madgaon',
      'vasco',
      'mapusa',
      'ponda',
      'candolim',
      'calangute',
      'baga',
      'anjuna',
      'vagator',
      'morjim',
      'porvorim',
      'colva',
      'palolem',
    ],
  },
  {
    state: 'Delhi NCR',
    matches: [
      'delhi',
      'new delhi',
      'ncr',
      'gurgaon',
      'gurugram',
      'noida',
      'greater noida',
      'ghaziabad',
      'faridabad',
      'sonipat',
      'manesar',
      'dwarka',
      'saket',
      'vasant',
      'chhatarpur',
      'sainik farm',
    ],
  },
  {
    state: 'Telangana',
    matches: [
      'telangana',
      'hyderabad',
      'secunderabad',
      'cyberabad',
      'gachibowli',
      'jubilee hills',
      'banjara hills',
      'madhapur',
      'kondapur',
      'warangal',
      'nizamabad',
      'karimnagar',
    ],
  },
  {
    state: 'Tamil Nadu',
    matches: [
      'tamil nadu',
      'tamilnadu',
      'chennai',
      'madras',
      'coimbatore',
      'madurai',
      'ecr',
      'omr',
      'salem',
      'trichy',
      'tiruppur',
      'tirunelveli',
      'vellore',
      'erode',
    ],
  },
  {
    state: 'Rajasthan',
    matches: [
      'rajasthan',
      'jaipur',
      'udaipur',
      'jodhpur',
      'ajmer',
      'kota',
      'bhiwadi',
      'neemrana',
      'pushkar',
      'alwar',
      'bikaner',
      'bhilwara',
      'jaisalmer',
    ],
  },
  {
    state: 'Gujarat',
    matches: [
      'gujarat',
      'ahmedabad',
      'surat',
      'vadodara',
      'baroda',
      'rajkot',
      'gandhinagar',
      'bhavnagar',
      'vapi',
      'valsad',
      'jamnagar',
      'anand',
    ],
  },
  {
    state: 'Punjab / Chandigarh',
    matches: [
      'punjab',
      'chandigarh',
      'mohali',
      'panchkula',
      'ludhiana',
      'amritsar',
      'jalandhar',
      'patiala',
      'zirakpur',
      'bathinda',
    ],
  },
  {
    state: 'Uttar Pradesh',
    matches: [
      'uttar pradesh',
      'lucknow',
      'kanpur',
      'varanasi',
      'banaras',
      'kashi',
      'agra',
      'meerut',
      'prayagraj',
      'allahabad',
      'bareilly',
      'ayodhya',
      'gorakhpur',
    ],
  },
  {
    state: 'West Bengal',
    matches: [
      'west bengal',
      'bengal',
      'kolkata',
      'calcutta',
      'howrah',
      'salt lake',
      'new town',
      'siliguri',
      'durgapur',
      'darjeeling',
    ],
  },
  {
    state: 'Uttarakhand',
    matches: [
      'uttarakhand',
      'dehradun',
      'rishikesh',
      'haridwar',
      'mussoorie',
      'nainital',
      'haldwani',
      'roorkee',
    ],
  },
  {
    state: 'Himachal Pradesh',
    matches: ['himachal pradesh', 'himachal', 'shimla', 'manali', 'kasauli', 'dharamshala', 'solan', 'kullu'],
  },
  {
    state: 'Kerala',
    matches: [
      'kerala',
      'kochi',
      'cochin',
      'trivandrum',
      'thiruvananthapuram',
      'calicut',
      'kozhikode',
      'wayanad',
      'kottayam',
      'munnar',
      'thrissur',
      'alleppey',
      'alappuzha',
    ],
  },
  {
    state: 'Andhra Pradesh',
    matches: ['andhra pradesh', 'andhra', 'visakhapatnam', 'vizag', 'vijayawada', 'guntur', 'tirupati', 'nellore'],
  },
  {
    state: 'Madhya Pradesh',
    matches: ['madhya pradesh', 'indore', 'bhopal', 'jabalpur', 'gwalior', 'ujjain'],
  },
  {
    state: 'Assam / Northeast',
    matches: ['assam', 'guwahati', 'shillong', 'dimapur', 'imphal', 'agartala'],
  },
];

/**
 * Resolves the primary Indian State or standard region from city, state, or mixed text.
 * e.g., "Gokarna, Karnataka" -> "Karnataka"
 *       "Gokarna" -> "Karnataka"
 *       "Bangalore / Karnataka" -> "Karnataka"
 *       "Bangalore" -> "Karnataka"
 *       "Mumbai, Maharashtra" -> "Maharashtra"
 */
export function resolveStateFromLocation(
  locText: string | null | undefined
): string | null {
  if (!locText) return null;
  const raw = locText.trim();
  if (!raw) return null;

  // Handle existing composite labels
  if (raw === 'Bangalore / Karnataka') return 'Karnataka';
  if (raw === 'Hyderabad / Telangana') return 'Telangana';
  if (raw === 'Tamil Nadu / Chennai') return 'Tamil Nadu';
  if (raw === 'Rajasthan / Jaipur') return 'Rajasthan';
  if (raw === 'Kolkata / West Bengal') return 'West Bengal';
  if (raw === 'Uttarakhand / Dehradun') return 'Uttarakhand';
  if (raw === 'Maharashtra & Goa') {
    return raw.toLowerCase().includes('goa') ? 'Goa' : 'Maharashtra';
  }

  const lower = raw.toLowerCase();

  // 1. Direct match on standard state names
  for (const item of STATE_DIRECT_MAP) {
    if (lower === item.state.toLowerCase()) {
      return item.state;
    }
  }

  // 2. Tokenized check (e.g. "Gokarna, Karnataka" split into tokens)
  const tokens = lower
    .split(/[,/\\-]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    for (const item of STATE_DIRECT_MAP) {
      if (token === item.state.toLowerCase() || item.matches.includes(token)) {
        return item.state;
      }
    }
  }

  // 3. Word boundary regex in full string
  for (const item of STATE_DIRECT_MAP) {
    for (const m of item.matches) {
      const regex = new RegExp(`\\b${m}\\b`, 'i');
      if (regex.test(lower)) {
        return item.state;
      }
    }
  }

  // 4. Check CITY_KEYWORDS
  for (const entry of CITY_KEYWORDS) {
    for (const kw of entry.keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(lower)) {
        return entry.label;
      }
    }
  }

  return null;
}

/**
 * Resolves the state for a quotation:
 * If location is "Gokarna, Karnataka" -> returns "Karnataka"
 * If location is "Gokarna" -> returns "Karnataka"
 */
export function getQuotationState(
  quotation:
    | Quotation
    | {
        location?: string | null;
        client_id?: string;
        client_name?: string;
        internal_notes?: string | null;
        contact_number?: string;
        contact_number_raw?: string;
      },
  clients?: Client[]
): string {
  const loc = getQuotationLocation(quotation, clients);
  if (!loc || loc === 'Other') return 'Other';
  const resolvedState = resolveStateFromLocation(loc);
  return resolvedState || loc;
}

/**
 * Checks if a quotation's location matches a filter:
 * Supports filtering by State (e.g., "Karnataka" matches "Gokarna, Karnataka" and "Bangalore")
 * as well as direct city/substring matches.
 */
export function isLocationMatch(
  quotationLoc: string | null | undefined,
  filterVal: string
): boolean {
  if (!filterVal || filterVal === 'All') return true;
  if (!quotationLoc) return filterVal === 'Other';

  // Exact match
  if (quotationLoc.toLowerCase() === filterVal.toLowerCase()) return true;

  // State resolution match: e.g. "Gokarna, Karnataka" with filter "Karnataka"
  const qState = resolveStateFromLocation(quotationLoc);
  const fState = resolveStateFromLocation(filterVal) || filterVal;
  if (qState && fState && qState.toLowerCase() === fState.toLowerCase()) {
    return true;
  }

  // Substring / word match
  const qLower = quotationLoc.toLowerCase();
  const fLower = filterVal.toLowerCase();
  if (qLower.includes(fLower) || fLower.includes(qLower)) {
    return true;
  }

  return false;
}

/**
 * Suggested standard location options for dropdowns/inputs
 */
export const POPULAR_LOCATIONS: string[] = [
  'Karnataka',
  'Maharashtra',
  'Delhi NCR',
  'Goa',
  'Telangana',
  'Tamil Nadu',
  'Rajasthan',
  'Gujarat',
  'Uttar Pradesh',
  'Punjab / Chandigarh',
  'West Bengal',
  'Uttarakhand',
  'Himachal Pradesh',
  'Kerala',
  'Andhra Pradesh',
  'Madhya Pradesh',
  'Assam / Northeast',
  'Other',
];
