export type Deadline =
	| {
			type: 'tournament';
			at: Date;
	  }
	| {
			type: 'league';
			at: Date;
	  };

// xxx: implement deadlines
