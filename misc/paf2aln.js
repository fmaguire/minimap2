var getopt = function(args, ostr) {
	var oli; // option letter list index
	if (typeof(getopt.place) == 'undefined')
		getopt.ind = 0, getopt.arg = null, getopt.place = -1;
	if (getopt.place == -1) { // update scanning pointer
		if (getopt.ind >= args.length || args[getopt.ind].charAt(getopt.place = 0) != '-') {
			getopt.place = -1;
			return null;
		}
		if (getopt.place + 1 < args[getopt.ind].length && args[getopt.ind].charAt(++getopt.place) == '-') { // found "--"
			++getopt.ind;
			getopt.place = -1;
			return null;
		}
	}
	var optopt = args[getopt.ind].charAt(getopt.place++); // character checked for validity
	if (optopt == ':' || (oli = ostr.indexOf(optopt)) < 0) {
		if (optopt == '-') return null; //  if the user didn't specify '-' as an option, assume it means null.
		if (getopt.place < 0) ++getopt.ind;
		return '?';
	}
	if (oli+1 >= ostr.length || ostr.charAt(++oli) != ':') { // don't need argument
		getopt.arg = null;
		if (getopt.place < 0 || getopt.place >= args[getopt.ind].length) ++getopt.ind, getopt.place = -1;
	} else { // need an argument
		if (getopt.place >= 0 && getopt.place < args[getopt.ind].length)
			getopt.arg = args[getopt.ind].substr(getopt.place);
		else if (args.length <= ++getopt.ind) { // no arg
			getopt.place = -1;
			if (ostr.length > 0 && ostr.charAt(0) == ':') return ':';
			return '?';
		} else getopt.arg = args[getopt.ind]; // white space
		getopt.place = -1;
		++getopt.ind;
	}
	return optopt;
}

var c, maf_out = false, line_len = 80;
while ((c = getopt(arguments, "ml:")) != null) {
	if (c == 'm') maf_out = true;
	else if (c == 'l') line_len = parseInt(getopt.arg); // TODO: not implemented yet
}
if (line_len == 0) line_len = 0x7fffffff;

if (getopt.ind == arguments.length) {
	print("Usage: k8 paf2aln.js [options] <with-cs.paf>");
	print("Options:");
	print("  -m        MAF output (BLAST-like output by default)");
	print("  -l INT    line length in BLAST-like output [80]");
	print("");
	print("Note: this script only works when minimap2 is run with option '-S'");
	exit(1);
}

function padding_str(x, len, right)
{
	var s = x.toString();
	if (s.length < len) {
		if (right) s += Array(len - s.length + 1).join(" ");
		else s = Array(len - s.length + 1).join(" ") + s;
	}
	return s;
}

function update_aln(s_ref, s_qry, s_mid, type, seq, slen)
{
	var l = type == '*'? 1 : seq.length;
	if (type == '=') {
		s_ref.set(seq);
		s_qry.set(seq);
		s_mid.set(Array(l+1).join("|"));
		slen[0] += l, slen[1] += l;
	} else if (type == '*') {
		s_ref.set(seq.charAt(0));
		s_qry.set(seq.charAt(1));
		s_mid.set(' ');
		slen[0] += 1, slen[1] += 1;
	} else if (type == '+') {
		s_ref.set(Array(l+1).join("-"));
		s_qry.set(seq);
		s_mid.set(Array(l+1).join(" "));
		slen[1] += l;
	} else if (type == '-') {
		s_ref.set(seq);
		s_qry.set(Array(l+1).join("-"));
		s_mid.set(Array(l+1).join(" "));
		slen[0] += l;
	}
}

function print_aln(rs, qs, strand, slen, elen, s_ref, s_qry, s_mid)
{
	print(["Ref+:", padding_str(rs + slen[0] + 1, 10, false), s_ref.toString(), padding_str(rs + elen[0], 10, true)].join(" "));
	print("                 " + s_mid.toString());
	var st, en;
	if (strand == '+') st = qs + slen[1] + 1, en = qs + elen[1];
	else st = qs - slen[1], en = qs - elen[1] + 1;
	print(["Qry" + strand + ":", padding_str(st,               10, false), s_qry.toString(), padding_str(en          , 10, true)].join(" "));
}

var s_ref = new Bytes(), s_qry = new Bytes(), s_mid = new Bytes();
var re = /([=\-\+\*])([A-Za-z]+)/g;

var buf = new Bytes();
var file = new File(arguments[getopt.ind]);
if (maf_out) print("##maf version=1\n");
while (file.readline(buf) >= 0) {
	var m, line = buf.toString();
	var t = line.split("\t", 12);
	if ((m = /\tcs:Z:(\S+)/.exec(line)) == null) continue;
	var cs = m[1];
	s_ref.length = s_qry.length = s_mid.length = 0;
	var slen = [0, 0], elen = [0, 0];
	if (maf_out) {
		while ((m = re.exec(cs)) != null)
			update_aln(s_ref, s_qry, s_mid, m[1], m[2], elen);
		if (maf_out) {
			var score = (m = /\tAS:i:(\d+)/.exec(line)) != null? parseInt(m[1]) : 0;
			var len = t[0].length > t[5].length? t[0].length : t[5].length;
			print("a " + score);
			print(["s", padding_str(t[5], len, true), padding_str(t[7], 10, false), padding_str(parseInt(t[8]) - parseInt(t[7]), 10, false),
				   "+", padding_str(t[6], 10, false), s_ref.toString()].join(" "));
			var qs, qe, ql = parseInt(t[1]);
			if (t[4] == '+') {
				qs = parseInt(t[2]);
				qe = parseInt(t[3]);
			} else {
				qs = ql - parseInt(t[3]);
				qe = ql - parseInt(t[2]);
			}
			print(["s", padding_str(t[0], len, true), padding_str(qs, 10, false), padding_str(qe - qs, 10, false),
				   t[4], padding_str(ql, 10, false), s_qry.toString()].join(" "));
			print("");
		}
	} else {
		line = line.replace(/\tc[sg]:Z:\S+/g, "");
		print('>' + line);
		var rs = parseInt(t[7]), qs = t[4] == '+'? parseInt(t[2]) : parseInt(t[3]);
		var n_blocks = 0;
		while ((m = re.exec(cs)) != null) {
			var start = 0, rest = m[1] == '*'? 1 : m[2].length;
			while (rest > 0) {
				var l_proc;
				if (s_ref.length + rest >= line_len) {
					l_proc = line_len - s_ref.length;
					update_aln(s_ref, s_qry, s_mid, m[1], m[1] == '*'? m[2] : m[2].substr(start, l_proc), elen);
					if (n_blocks > 0) print("");
					print_aln(rs, qs, t[4], slen, elen, s_ref, s_qry, s_mid);
					++n_blocks;
					s_ref.length = s_qry.length = s_mid.length = 0;
					slen[0] = elen[0], slen[1] = elen[1];
				} else {
					l_proc = rest;
					update_aln(s_ref, s_qry, s_mid, m[1], m[1] == '*'? m[2] : m[2].substr(start, l_proc), elen);
				}
				rest -= l_proc, start += l_proc;
			}
		}
		if (s_ref.length > 0) {
			if (n_blocks > 0) print("");
			print_aln(rs, qs, t[4], slen, elen, s_ref, s_qry, s_mid);
			++n_blocks;
		}
		print("//");
	}
}
file.close();
buf.destroy();

s_ref.destroy(); s_qry.destroy(); s_mid.destroy();
