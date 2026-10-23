--
-- PostgreSQL database dump
--

\restrict yh0S3CnrKarSkqvoxRwZDmGFdjsfUOAETfiSHbtd4gg5gH66Xx1fwls9JQJjOeg

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

-- Started on 2026-10-23 14:26:22

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 2 (class 3079 OID 23422)
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- TOC entry 5269 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- TOC entry 3 (class 3079 OID 23527)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- TOC entry 5270 (class 0 OID 0)
-- Dependencies: 3
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- TOC entry 960 (class 1247 OID 23618)
-- Name: employment_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.employment_status AS ENUM (
    'ACTIVE',
    'ON_LEAVE',
    'INACTIVE'
);


ALTER TYPE public.employment_status OWNER TO postgres;

--
-- TOC entry 951 (class 1247 OID 23566)
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role AS ENUM (
    'ADMIN',
    'EMPLOYEE'
);


ALTER TYPE public.user_role OWNER TO postgres;

--
-- TOC entry 232 (class 1255 OID 23708)
-- Name: sync_employee_profile_id_to_username(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_employee_profile_id_to_username() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE users
  SET
    username = NEW.employee_id,
    updated_at = NOW()
  WHERE id = NEW.user_id
    AND role = 'EMPLOYEE'
    AND username IS DISTINCT FROM NEW.employee_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_employee_profile_id_to_username() OWNER TO postgres;

--
-- TOC entry 254 (class 1255 OID 23709)
-- Name: sync_employee_username_to_profile_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_employee_username_to_profile_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE employee_profiles
  SET
    employee_id = NEW.username,
    updated_at = NOW()
  WHERE user_id = NEW.id
    AND employee_id IS DISTINCT FROM NEW.username;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_employee_username_to_profile_id() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 224 (class 1259 OID 23625)
-- Name: attendance_locations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name public.citext NOT NULL,
    latitude numeric(9,6) NOT NULL,
    longitude numeric(9,6) NOT NULL,
    wifi_ip inet,
    geofence_radius_meters integer NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT attendance_locations_latitude_range CHECK (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))),
    CONSTRAINT attendance_locations_longitude_range CHECK (((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))),
    CONSTRAINT attendance_locations_name_not_blank CHECK ((length(TRIM(BOTH FROM (name)::text)) > 0)),
    CONSTRAINT attendance_locations_radius_range CHECK (((geofence_radius_meters >= 1) AND (geofence_radius_meters <= 100000)))
);


ALTER TABLE public.attendance_locations OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 23744)
-- Name: attendance_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_user_id uuid NOT NULL,
    attendance_date date NOT NULL,
    attendance_location_id uuid NOT NULL,
    punch_in_at timestamp with time zone NOT NULL,
    punch_in_latitude numeric(9,6) NOT NULL,
    punch_in_longitude numeric(9,6) NOT NULL,
    punch_in_accuracy_meters numeric(8,2) NOT NULL,
    punch_in_distance_meters numeric(8,2) NOT NULL,
    punch_out_at timestamp with time zone,
    punch_out_latitude numeric(9,6),
    punch_out_longitude numeric(9,6),
    punch_out_accuracy_meters numeric(8,2),
    punch_out_distance_meters numeric(8,2),
    punch_out_reason character varying(30),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT attendance_sessions_punch_out_complete CHECK ((((punch_out_at IS NULL) AND (punch_out_latitude IS NULL) AND (punch_out_longitude IS NULL) AND (punch_out_accuracy_meters IS NULL) AND (punch_out_distance_meters IS NULL) AND (punch_out_reason IS NULL)) OR ((punch_out_at IS NOT NULL) AND (punch_out_reason IS NOT NULL)))),
    CONSTRAINT attendance_sessions_punch_out_reason CHECK (((punch_out_reason IS NULL) OR ((punch_out_reason)::text = ANY ((ARRAY['MANUAL'::character varying, 'AUTO_SHIFT_END'::character varying, 'AUTO_MAX_DURATION'::character varying])::text[])))),
    CONSTRAINT attendance_sessions_time_order CHECK (((punch_out_at IS NULL) OR (punch_out_at >= punch_in_at)))
);


ALTER TABLE public.attendance_sessions OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 23699)
-- Name: employee_id_counter; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employee_id_counter (
    id smallint NOT NULL,
    last_value bigint NOT NULL,
    CONSTRAINT employee_id_counter_id_check CHECK ((id = 1)),
    CONSTRAINT employee_id_counter_last_value_check CHECK ((last_value >= 0))
);


ALTER TABLE public.employee_id_counter OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 23698)
-- Name: employee_id_sequence; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.employee_id_sequence
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.employee_id_sequence OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 23659)
-- Name: employee_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employee_profiles (
    user_id uuid NOT NULL,
    employee_id public.citext NOT NULL,
    phone character varying(30),
    designation character varying(120),
    department character varying(120),
    attendance_location_id uuid,
    employment_status public.employment_status DEFAULT 'ACTIVE'::public.employment_status NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    shift_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    CONSTRAINT employee_profiles_department_not_blank CHECK (((department IS NULL) OR (length(TRIM(BOTH FROM department)) > 0))),
    CONSTRAINT employee_profiles_designation_not_blank CHECK (((designation IS NULL) OR (length(TRIM(BOTH FROM designation)) > 0))),
    CONSTRAINT employee_profiles_employee_id_not_blank CHECK ((length(TRIM(BOTH FROM (employee_id)::text)) > 0)),
    CONSTRAINT employee_profiles_phone_not_blank CHECK (((phone IS NULL) OR (length(TRIM(BOTH FROM phone)) > 0)))
);


ALTER TABLE public.employee_profiles OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 23597)
-- Name: refresh_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.refresh_sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_hash character(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.refresh_sessions OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 23411)
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.schema_migrations (
    id text NOT NULL,
    checksum character(64) NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 23571)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email public.citext NOT NULL,
    username public.citext NOT NULL,
    full_name character varying(150) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role public.user_role NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_email_not_blank CHECK ((length(TRIM(BOTH FROM (email)::text)) > 0)),
    CONSTRAINT users_username_not_blank CHECK ((length(TRIM(BOTH FROM (username)::text)) > 0))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 228 (class 1259 OID 23712)
-- Name: work_shifts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.work_shifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name public.citext NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    max_duration_minutes integer NOT NULL,
    timezone character varying(64) DEFAULT 'Asia/Kolkata'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT work_shifts_duration_range CHECK (((max_duration_minutes >= 1) AND (max_duration_minutes <= 1440))),
    CONSTRAINT work_shifts_time_order CHECK ((end_time > start_time))
);


ALTER TABLE public.work_shifts OWNER TO postgres;

--
-- TOC entry 5258 (class 0 OID 23625)
-- Dependencies: 224
-- Data for Name: attendance_locations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attendance_locations (id, name, latitude, longitude, wifi_ip, geofence_radius_meters, is_primary, is_active, created_by, created_at, updated_at) FROM stdin;
e99ce238-146d-4813-83c0-41807914258a	Kosqu Office	19.054519	73.015991	\N	300	f	t	a54e7030-7840-485d-bbfd-8a0ea37eea95	2026-10-23 10:35:32.380496+05:30	2026-10-23 10:35:32.380496+05:30
0480fcb3-6139-410b-8dc3-fffc470f77b5	Pil Office	19.021100	73.018400	\N	400	f	t	a54e7030-7840-485d-bbfd-8a0ea37eea95	2026-10-23 10:37:13.620446+05:30	2026-10-23 10:37:13.620446+05:30
41274e7e-7148-47f6-b4c1-97b3211042ad	Godrej Office	19.093840	72.922610	\N	500	f	t	a54e7030-7840-485d-bbfd-8a0ea37eea95	2026-10-23 10:38:58.916601+05:30	2026-10-23 10:38:58.916601+05:30
\.


--
-- TOC entry 5263 (class 0 OID 23744)
-- Dependencies: 229
-- Data for Name: attendance_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attendance_sessions (id, employee_user_id, attendance_date, attendance_location_id, punch_in_at, punch_in_latitude, punch_in_longitude, punch_in_accuracy_meters, punch_in_distance_meters, punch_out_at, punch_out_latitude, punch_out_longitude, punch_out_accuracy_meters, punch_out_distance_meters, punch_out_reason, created_at, updated_at) FROM stdin;
666e82b8-bf52-4c89-8b85-61cc75f12032	0d704c97-ca70-462d-a6b5-c8564ec16343	2026-10-23	e99ce238-146d-4813-83c0-41807914258a	2026-10-23 11:52:52.496+05:30	19.054550	73.015993	14.94	3.42	\N	\N	\N	\N	\N	\N	2026-10-23 11:52:52.496207+05:30	2026-10-23 11:52:52.496207+05:30
\.


--
-- TOC entry 5261 (class 0 OID 23699)
-- Dependencies: 227
-- Data for Name: employee_id_counter; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employee_id_counter (id, last_value) FROM stdin;
1	3
\.


--
-- TOC entry 5259 (class 0 OID 23659)
-- Dependencies: 225
-- Data for Name: employee_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employee_profiles (user_id, employee_id, phone, designation, department, attendance_location_id, employment_status, created_by, created_at, updated_at, shift_id) FROM stdin;
0d704c97-ca70-462d-a6b5-c8564ec16343	WW-001	8010545025	SDE	Development	e99ce238-146d-4813-83c0-41807914258a	ACTIVE	a54e7030-7840-485d-bbfd-8a0ea37eea95	2026-10-23 10:55:13.916836+05:30	2026-10-23 11:07:52.165108+05:30	00000000-0000-0000-0000-000000000001
2aa903e5-d4ee-466d-accb-45bc98fa7d00	WW-002	8052145236	STE	Testing	41274e7e-7148-47f6-b4c1-97b3211042ad	ACTIVE	a54e7030-7840-485d-bbfd-8a0ea37eea95	2026-10-23 11:10:26.411693+05:30	2026-10-23 11:10:26.411693+05:30	00000000-0000-0000-0000-000000000001
cdfe6d47-7158-4eb4-9775-c4b4fd3a5e87	WW-003	9856321478	System Engineer	IT	0480fcb3-6139-410b-8dc3-fffc470f77b5	ACTIVE	a54e7030-7840-485d-bbfd-8a0ea37eea95	2026-10-23 11:12:09.259219+05:30	2026-10-23 11:12:09.259219+05:30	00000000-0000-0000-0000-000000000001
\.


--
-- TOC entry 5257 (class 0 OID 23597)
-- Dependencies: 223
-- Data for Name: refresh_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.refresh_sessions (id, user_id, token_hash, expires_at, revoked_at, created_at) FROM stdin;
18eb6acb-11f4-44c5-9ba4-60abb874d162	a54e7030-7840-485d-bbfd-8a0ea37eea95	a29ef99e9a3fe77ee04d91ff34cce843b377c64da76a610a612bd93416328347	2026-10-30 00:43:24.351+05:30	2026-10-23 00:43:24.429645+05:30	2026-10-23 00:43:24.334731+05:30
6b106c68-5bbb-4228-b53b-5951a53efa36	a54e7030-7840-485d-bbfd-8a0ea37eea95	828133b1a5297bc46f9d11e63ecdac47cc304dcf3ac4b269666ace23e201923e	2026-10-30 11:30:34.047+05:30	\N	2026-10-23 11:30:34.015947+05:30
9aa7462f-e1f2-4571-9b95-a63123d76856	a54e7030-7840-485d-bbfd-8a0ea37eea95	42669abbbe9126039ebd829ab54e613065a7ea2135e39acffba1f2f74c8f5ae2	2026-10-30 00:43:24.435+05:30	2026-10-23 00:43:24.843063+05:30	2026-10-23 00:43:24.429645+05:30
b76f32d7-4ccc-4593-864e-d63dc8ac0127	a54e7030-7840-485d-bbfd-8a0ea37eea95	a770391c4497f242e7407afbacd55591cfcb7c95cfc6d45071b8e814dbe967af	2026-10-30 00:43:37.371+05:30	2026-10-23 00:43:37.386823+05:30	2026-10-23 00:43:37.371239+05:30
8f3993cc-208e-45fc-8e6f-61bb6b071b8e	a54e7030-7840-485d-bbfd-8a0ea37eea95	932c3d7be58c4e9067599f4d1cc0c7fa1323a39e9a7cf36f5ab2c0c3fc1835ce	2026-10-30 00:43:37.388+05:30	2026-10-23 00:43:37.41062+05:30	2026-10-23 00:43:37.386823+05:30
fbbb599b-3150-4d08-acb4-5da75a2dbaba	a54e7030-7840-485d-bbfd-8a0ea37eea95	c08bec83521af9bd869c447078e3f101162d520fadb874d7193cd13e413abd1e	2026-10-30 11:30:56.868+05:30	\N	2026-10-23 11:30:56.86763+05:30
f1296d1f-ef98-4400-98b2-ccce51b73e4e	a54e7030-7840-485d-bbfd-8a0ea37eea95	f57e7e798078ea9aa35321b7925062600f9ce074e4aaa2b765614dd1f84ca9f3	2026-10-30 00:48:36.325+05:30	2026-10-23 00:48:36.339703+05:30	2026-10-23 00:48:36.313399+05:30
55d4cb34-b0ec-434f-b81e-350e4c95a701	a54e7030-7840-485d-bbfd-8a0ea37eea95	b5617ddaf90d49da22c1b84c917af727bf28e18ba1d7024e9cc0d21141f1dd77	2026-10-30 00:49:38.857+05:30	\N	2026-10-23 00:49:38.850264+05:30
2c8be736-8d57-40db-9a6a-3c70c9cb6e8e	a54e7030-7840-485d-bbfd-8a0ea37eea95	a19209b07cd210bb78919b3953f4c19b4ef946465ba11da89432804edadbed04	2026-10-30 09:51:44.603+05:30	2026-10-23 09:52:46.427158+05:30	2026-10-23 09:51:44.598278+05:30
c859e71e-bd7e-435f-ac03-43eec7e16d84	a54e7030-7840-485d-bbfd-8a0ea37eea95	c8da6aa4a57c8ab74b8f7141aab4c49f155b5b2737b78d27849b7922fc750519	2026-10-30 09:52:52.496+05:30	\N	2026-10-23 09:52:52.496098+05:30
77d3971e-18d7-47b5-aab9-dac4c1b8c69e	a54e7030-7840-485d-bbfd-8a0ea37eea95	fb7780637b885d57c276fd2261826cc3636f086667999aff0e2efae5f5a405ab	2026-10-30 10:00:01.529+05:30	\N	2026-10-23 10:00:01.522748+05:30
fdcfd745-57ef-4028-b8e7-7635068e19d1	a54e7030-7840-485d-bbfd-8a0ea37eea95	fc2217f3f449ab7f1a6f5269bbd5ca1282479b8adfbf0a9d87d82a39d5bf19d0	2026-10-30 10:04:01.207+05:30	\N	2026-10-23 10:04:01.201106+05:30
a2ba87fc-74b7-415d-a158-97818ecca6e3	0d704c97-ca70-462d-a6b5-c8564ec16343	f3970d4abb7905e6078334575e41bfb246064c6422cbb90f8ec136e6790de575	2026-10-30 11:23:58.165+05:30	2026-10-23 11:50:39.49253+05:30	2026-10-23 11:23:58.164242+05:30
2f7ad228-c9c8-4873-b321-e22542bd0bce	0d704c97-ca70-462d-a6b5-c8564ec16343	9b1806446d975935cceeab598d4f1ca4185ead3a22832a09d2758dca7e7c9147	2026-10-30 11:50:39.54+05:30	2026-10-23 11:57:06.943975+05:30	2026-10-23 11:50:39.49253+05:30
81109f8a-9373-4707-a101-d2279d3441c9	a54e7030-7840-485d-bbfd-8a0ea37eea95	92e939a94b56e0ad1b498174d064c9231addae14495371c7ee98b05f4a317800	2026-10-30 10:09:08.345+05:30	\N	2026-10-23 10:09:08.343548+05:30
caf89a27-2063-45f0-bb0e-6792f62beaf9	a54e7030-7840-485d-bbfd-8a0ea37eea95	73d886276694c35fba14f82b0c561f78e8a66a6ce0efcd53e108cf0f981af4d5	2026-10-30 11:57:49.365+05:30	2026-10-23 11:58:16.139846+05:30	2026-10-23 11:57:49.369204+05:30
058ec63e-832c-4c6b-8cc1-5b6229c058be	0d704c97-ca70-462d-a6b5-c8564ec16343	a815b4473e05e4cf669a8b0a9822339f7632ed20f48a66d3262189ab66289d05	2026-10-30 12:04:26.469+05:30	2026-10-23 12:07:05.621123+05:30	2026-10-23 12:04:26.466315+05:30
1b8d0107-6481-4b63-9a03-672e82aef6d7	a54e7030-7840-485d-bbfd-8a0ea37eea95	e6693455cb5ea85c683d431f7071663536bada9f35a98602e0916effd4ffee1c	2026-10-30 10:18:38.746+05:30	\N	2026-10-23 10:18:38.740375+05:30
cdbd2dce-606e-41cd-b57c-617f55e09c19	2aa903e5-d4ee-466d-accb-45bc98fa7d00	8690efd545b3c9b3515f129147317470e890ea771ea61cd95f5a71b07f3e026d	2026-10-30 12:15:17.43+05:30	\N	2026-10-23 12:15:17.426823+05:30
791c37fb-0957-47f3-bc96-8739c3fc6d7f	2aa903e5-d4ee-466d-accb-45bc98fa7d00	fc21e350366bcb82e2a32dde4810c06269398e6114fb5f7fdc382ce91c894305	2026-10-30 12:17:08.295+05:30	\N	2026-10-23 12:17:08.294861+05:30
ec86e722-95a4-44db-b0df-bfe20b7027f7	2aa903e5-d4ee-466d-accb-45bc98fa7d00	1707f981ab283ca9e4c4da2a0b88eec8404c88a2c57a01b362a8d802fcd133a2	2026-10-30 12:07:20.487+05:30	2026-10-23 12:23:24.561664+05:30	2026-10-23 12:07:20.485139+05:30
0a21853d-a037-408a-b349-81d5658c6e25	a54e7030-7840-485d-bbfd-8a0ea37eea95	034c1145d37a45b0e30755b9ff80815b50e5796e556c4476c163d5a60b0b4d0d	2026-10-30 10:21:36.24+05:30	\N	2026-10-23 10:21:36.233145+05:30
f8023000-3a56-4bb8-80e9-b9e3c507109a	a54e7030-7840-485d-bbfd-8a0ea37eea95	929a37eaffa0c8031f6981d845fde72af969eda88832157ecc6221d14b798990	2026-10-30 12:23:42.361+05:30	\N	2026-10-23 12:23:42.359016+05:30
abaf2144-9840-4b84-bfd9-4abb8eab44dd	a54e7030-7840-485d-bbfd-8a0ea37eea95	aeb1eab2262d1ad7a6ecd13c943b23a1b01dc0143c32813ca0057dee2cbe4dc7	2026-10-30 12:23:53.068+05:30	\N	2026-10-23 12:23:53.068138+05:30
4f9b0914-e015-4f6b-a8b1-22d12053683b	0d704c97-ca70-462d-a6b5-c8564ec16343	7f9a742c169e767f72b84c961c6bfe643c2de18c5b6f5f544842220d6e652507	2026-10-30 12:25:56.832+05:30	\N	2026-10-23 12:25:56.831894+05:30
9000eafa-0835-464a-92f4-94ea0d2d6424	0d704c97-ca70-462d-a6b5-c8564ec16343	46ab5e69e24b794ee71203906d0c62b4afb5a08046b21be8b1f51d176996d841	2026-10-30 12:26:04.355+05:30	\N	2026-10-23 12:26:04.355776+05:30
818dcbf4-08a3-4779-abdb-65b5eb1ac85f	a54e7030-7840-485d-bbfd-8a0ea37eea95	b23420da4e713de4a466aa74552e1f65b25923ea4fc421c4eb53d40bdf715ba8	2026-10-30 09:57:30.234+05:30	2026-10-23 10:27:55.222109+05:30	2026-10-23 09:57:30.225361+05:30
3a64516d-fd59-4a28-9bfe-a54fcdc8e544	2aa903e5-d4ee-466d-accb-45bc98fa7d00	54fb87080acee2d556b4aace11dadd6bd02e72ce3d093f34f65feea6d7f34bc6	2026-10-30 12:23:24.705+05:30	2026-10-23 12:27:59.544188+05:30	2026-10-23 12:23:24.561664+05:30
6e5b8355-8a5d-446c-a894-d3a3dca5ca00	a54e7030-7840-485d-bbfd-8a0ea37eea95	7fceb316fe5433d096cea8a847d66404a4a5a247ecbf3d9e2ff9113b357228b1	2026-10-30 10:47:45.625+05:30	\N	2026-10-23 10:47:45.612875+05:30
84bd2414-e91e-4869-ab28-e8fab18726d6	a54e7030-7840-485d-bbfd-8a0ea37eea95	3a433d4cce4b7c3cbb5fce98b51f22721bc53856f6d530810b299a42baad5049	2026-10-30 12:33:13.954+05:30	\N	2026-10-23 12:33:13.946015+05:30
79d0a36d-d7c4-4a62-b563-940dbe01594a	a54e7030-7840-485d-bbfd-8a0ea37eea95	272b604f11fd163cea6cda2871573c9a9e860e9d1d811734fa18f66f9ef18cce	2026-10-30 10:48:20.878+05:30	\N	2026-10-23 10:48:20.871999+05:30
cbf8cdc8-7215-40a4-a1ab-0a082a564de7	a54e7030-7840-485d-bbfd-8a0ea37eea95	c4ed440f2eb23f6b7b0e2e5b2b808fa7d645ddc7bd761e20360e5917ef152787	2026-10-30 12:33:29.558+05:30	\N	2026-10-23 12:33:29.55481+05:30
9af8aa60-9dfd-4f13-ace6-bd90a7701db4	a54e7030-7840-485d-bbfd-8a0ea37eea95	893991ddf8947396140d6b1c9825336f8ac949e33e49c3e17a952bc4e3583909	2026-10-30 12:33:54.336+05:30	\N	2026-10-23 12:33:54.323749+05:30
256f9d6f-c971-405c-9d3e-61f0102d463e	a54e7030-7840-485d-bbfd-8a0ea37eea95	cdae17ff2c0fda571297ec67de4e58e322fffe2a059d15da1b0604a6ff87f43f	2026-10-30 10:49:22.507+05:30	2026-10-23 10:49:22.620478+05:30	2026-10-23 10:49:22.504467+05:30
b27bf91a-dc19-4985-bcdc-8c9772fd4412	a54e7030-7840-485d-bbfd-8a0ea37eea95	b533fd362d352ab307344606dbc3c3ab758891da0fc46c231402434ade6c89d8	2026-10-30 10:51:17.265+05:30	\N	2026-10-23 10:51:17.258299+05:30
f8352dae-40d5-4fbf-aa3c-6687d0bc77e4	a54e7030-7840-485d-bbfd-8a0ea37eea95	44372d3cde0ba68cf8d8247cf23edae860efbef4edc9f183cbf763b509384f65	2026-10-30 10:27:55.342+05:30	2026-10-23 10:52:41.721502+05:30	2026-10-23 10:27:55.222109+05:30
4b84b4eb-0843-437a-af46-4cab8ea65b27	a54e7030-7840-485d-bbfd-8a0ea37eea95	002426e07026a6812b6aefdef2f30eb618896190f204e1edc5f7d74edee1c2cc	2026-10-30 12:42:02.482+05:30	\N	2026-10-23 12:42:02.483162+05:30
4e996cbd-86a8-497b-b2d5-1177d48c7615	a54e7030-7840-485d-bbfd-8a0ea37eea95	354a5b0859ed478861b39ea00065fd6eb65c7b9e3a1a02ceb4642d9edc34f2f6	2026-10-30 10:59:03.091+05:30	\N	2026-10-23 10:59:03.085938+05:30
06a748bd-0bb4-419c-8b9d-6f57c882dd30	0d704c97-ca70-462d-a6b5-c8564ec16343	81163af2b5d415161b9e2666dfbbc3c884c7fb848e74da198fddd2f3fae911a2	2026-10-30 12:42:02.795+05:30	\N	2026-10-23 12:42:02.800808+05:30
378e9ae1-b14b-49f7-bd52-87fb443f9f81	a54e7030-7840-485d-bbfd-8a0ea37eea95	a120352910b4bd9d1b2f57eeec9012c994d90bcfc683d86b32ef3661037a2c5c	2026-10-30 12:28:10.541+05:30	2026-10-23 12:54:43.351326+05:30	2026-10-23 12:28:10.544505+05:30
da147033-19f9-40f8-8521-5447651f0b2c	a54e7030-7840-485d-bbfd-8a0ea37eea95	82f2a354de48e0b2e05a53b698bf90fcbae633b97a760cf01735daa8b0731392	2026-10-30 12:54:43.392+05:30	\N	2026-10-23 12:54:43.351326+05:30
da8ef284-b54d-465a-825e-f8e9e1bdff7f	a54e7030-7840-485d-bbfd-8a0ea37eea95	9d2f4a708178740d5ad4b0d2166a4d6ba2d1fd3f02f45ee3c68f647e5f51863d	2026-10-30 12:56:08.363+05:30	\N	2026-10-23 12:56:08.363226+05:30
c7ab0d0c-b9fc-4317-a463-6fd65d90091d	a54e7030-7840-485d-bbfd-8a0ea37eea95	01f625171e17fc8448c7bdcc5204030cfdd5ea4d066d937ef7a59c25248e3452	2026-10-30 11:00:53.856+05:30	\N	2026-10-23 11:00:53.848662+05:30
70a083ce-c4bb-49a8-b203-fd1179efca8e	a54e7030-7840-485d-bbfd-8a0ea37eea95	35843ebef64fe93a2a120e00dae6e7468e8ce905f4188a2776b83eccaf833449	2026-10-30 12:56:32.02+05:30	\N	2026-10-23 12:56:32.012696+05:30
787bf274-088a-424e-bf29-fb10be22651d	2aa903e5-d4ee-466d-accb-45bc98fa7d00	c9d25298cd8f0a75a7cf684515a4ccc88673c1f8fd5e4370d4a7e0af4036d7a1	2026-10-30 13:02:43.98+05:30	\N	2026-10-23 13:02:43.975321+05:30
8801cafc-3279-4fc7-ae65-07e69fa3493b	a54e7030-7840-485d-bbfd-8a0ea37eea95	a896d3ae01f744e54f685d8024a3b12ed607711eed4f8fa37ab270750e1fe98b	2026-10-30 11:01:08.225+05:30	\N	2026-10-23 11:01:08.220623+05:30
e63f6ef0-e7c9-4e28-8c70-382ed14f068e	a54e7030-7840-485d-bbfd-8a0ea37eea95	99dba68dff594c6b44aa63bf307ad53aecbc8837dbf084cbf3bc19eba51c86e5	2026-10-30 11:08:03.21+05:30	\N	2026-10-23 11:08:03.203959+05:30
1d9b23dd-e587-484e-93ee-a2a79b5527ab	a54e7030-7840-485d-bbfd-8a0ea37eea95	937975c81f6d3fc893de3643a8adb17ec649a23edda0c063fd838406ab14a5d9	2026-10-30 11:08:19.553+05:30	\N	2026-10-23 11:08:19.554448+05:30
ca6b1784-0d23-48ea-b139-4ceac54074ab	a54e7030-7840-485d-bbfd-8a0ea37eea95	33bfd58cf3d9f37bea789b1b5a5322d2f2d16888284bf23ac52ad81f6f648967	2026-10-30 10:52:41.767+05:30	2026-10-23 11:09:32.582869+05:30	2026-10-23 10:52:41.721502+05:30
542392e4-a095-4b6d-aa51-6b903ddafacc	a54e7030-7840-485d-bbfd-8a0ea37eea95	0a10437eb470f6ef07482d74f6b3931d6acbb1192e409f53c4931183f276fc0a	2026-10-30 11:09:32.615+05:30	2026-10-23 11:12:21.428989+05:30	2026-10-23 11:09:32.582869+05:30
20be9813-9816-45da-b1b2-051c61d4a102	0d704c97-ca70-462d-a6b5-c8564ec16343	489f4e8935d4ab3bc9851e6905270cf71c319e40d9230d82a46282add1481462	2026-10-30 11:13:15.893+05:30	2026-10-23 11:22:28.881127+05:30	2026-10-23 11:13:15.89175+05:30
d330c51f-bc64-42bd-8cbd-4706d27e7dd3	a54e7030-7840-485d-bbfd-8a0ea37eea95	a17253cafb574b88e9424faa16ea7d6d32bc5a87ccc9c4b4f1becf9d833b3529	2026-10-30 11:22:52.728+05:30	2026-10-23 11:23:23.965183+05:30	2026-10-23 11:22:52.73117+05:30
\.


--
-- TOC entry 5255 (class 0 OID 23411)
-- Dependencies: 221
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.schema_migrations (id, checksum, applied_at) FROM stdin;
001_create_auth_schema.sql	fc7b40debf7b212475ec4a18d829089daaa0239a4d9b35ce229161e195686ea8	2026-10-23 00:43:00.534902+05:30
002_create_employee_and_location_schema.sql	1f8f6b40103a6763b1d764e56394b93e81a2e6d4fa324db0d739ceacfd46e4d0	2026-10-23 01:00:49.650779+05:30
003_create_employee_id_sequence.sql	3992885d5956668a91a6537b0bed800ada6744806c2485e64c515509d7407135	2026-10-23 10:47:38.240124+05:30
004_create_employee_id_counter.sql	0e2e058ce902910268cc52ffbe1d5ae939e9e46a1cb8e6cbee6dfe30079f779b	2026-10-23 10:58:54.905999+05:30
005_keep_employee_id_in_sync.sql	2e7e4d61887305ac6bc201846fc0bf065a02e8ecf087f0b7d3cbd67f31f1d2f0	2026-10-23 11:07:52.165108+05:30
006_create_attendance_schema.sql	03b9a7223cecf9cda0de091de039f1091857735ebaa38acebd8f3eb9ad393d62	2026-10-23 11:30:25.958009+05:30
\.


--
-- TOC entry 5256 (class 0 OID 23571)
-- Dependencies: 222
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, username, full_name, password_hash, role, is_active, last_login_at, created_at, updated_at) FROM stdin;
a54e7030-7840-485d-bbfd-8a0ea37eea95	admin@windworld.com	admin	WindWorld Administrator	$2b$12$BZGS.OPvz/xHe9c0zlp87OPBuAvW.EPYvljHjKkhzS825u/hHGK4a	ADMIN	t	2026-10-23 12:56:32.012696+05:30	2026-10-23 00:43:02.933273+05:30	2026-10-23 00:48:35.388829+05:30
2aa903e5-d4ee-466d-accb-45bc98fa7d00	narendra@ww.com	WW-002	Narendra Gaikwad	$2b$12$qDIRPirhSA6HvEywPa.jheZxwjzk1LFbBiz65ppBbRIalRRZeCqCO	EMPLOYEE	t	2026-10-23 13:02:43.975321+05:30	2026-10-23 11:10:26.411693+05:30	2026-10-23 11:10:26.411693+05:30
cdfe6d47-7158-4eb4-9775-c4b4fd3a5e87	samarth@ww.com	WW-003	Samarth Giram	$2b$12$s5FUEYfSTyzMU/x74Etjpemf9HktPnosc9leZSnoO3Y6OgMmLPtIG	EMPLOYEE	t	\N	2026-10-23 11:12:09.259219+05:30	2026-10-23 11:12:09.259219+05:30
0d704c97-ca70-462d-a6b5-c8564ec16343	harsh@ww.com	WW-001	Harsh Umesh Gawali	$2b$12$/LaG7cJUvQmlQkcExVe.cOB67eUxsfBQQaBROHzHDe7UTFreV1fda	EMPLOYEE	t	2026-10-23 12:42:02.800808+05:30	2026-10-23 10:55:13.916836+05:30	2026-10-23 10:55:13.916836+05:30
\.


--
-- TOC entry 5262 (class 0 OID 23712)
-- Dependencies: 228
-- Data for Name: work_shifts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.work_shifts (id, name, start_time, end_time, max_duration_minutes, timezone, is_active, created_at, updated_at) FROM stdin;
00000000-0000-0000-0000-000000000001	General Shift	10:00:00	18:00:00	480	Asia/Kolkata	t	2026-10-23 11:30:25.958009+05:30	2026-10-23 11:30:25.958009+05:30
\.


--
-- TOC entry 5271 (class 0 OID 0)
-- Dependencies: 226
-- Name: employee_id_sequence; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.employee_id_sequence', 10, true);


--
-- TOC entry 5075 (class 2606 OID 23652)
-- Name: attendance_locations attendance_locations_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_locations
    ADD CONSTRAINT attendance_locations_name_key UNIQUE (name);


--
-- TOC entry 5078 (class 2606 OID 23650)
-- Name: attendance_locations attendance_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_locations
    ADD CONSTRAINT attendance_locations_pkey PRIMARY KEY (id);


--
-- TOC entry 5094 (class 2606 OID 23767)
-- Name: attendance_sessions attendance_sessions_one_per_day; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_sessions
    ADD CONSTRAINT attendance_sessions_one_per_day UNIQUE (employee_user_id, attendance_date);


--
-- TOC entry 5097 (class 2606 OID 23765)
-- Name: attendance_sessions attendance_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_sessions
    ADD CONSTRAINT attendance_sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 5086 (class 2606 OID 23707)
-- Name: employee_id_counter employee_id_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_id_counter
    ADD CONSTRAINT employee_id_counter_pkey PRIMARY KEY (id);


--
-- TOC entry 5081 (class 2606 OID 23680)
-- Name: employee_profiles employee_profiles_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_profiles
    ADD CONSTRAINT employee_profiles_employee_id_key UNIQUE (employee_id);


--
-- TOC entry 5084 (class 2606 OID 23678)
-- Name: employee_profiles employee_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_profiles
    ADD CONSTRAINT employee_profiles_pkey PRIMARY KEY (user_id);


--
-- TOC entry 5070 (class 2606 OID 23607)
-- Name: refresh_sessions refresh_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_sessions
    ADD CONSTRAINT refresh_sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 5072 (class 2606 OID 23609)
-- Name: refresh_sessions refresh_sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_sessions
    ADD CONSTRAINT refresh_sessions_token_hash_key UNIQUE (token_hash);


--
-- TOC entry 5061 (class 2606 OID 23421)
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);


--
-- TOC entry 5063 (class 2606 OID 23594)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 5065 (class 2606 OID 23592)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 5067 (class 2606 OID 23596)
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- TOC entry 5088 (class 2606 OID 23736)
-- Name: work_shifts work_shifts_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_shifts
    ADD CONSTRAINT work_shifts_name_key UNIQUE (name);


--
-- TOC entry 5090 (class 2606 OID 23734)
-- Name: work_shifts work_shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.work_shifts
    ADD CONSTRAINT work_shifts_pkey PRIMARY KEY (id);


--
-- TOC entry 5076 (class 1259 OID 23658)
-- Name: attendance_locations_one_active_primary_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX attendance_locations_one_active_primary_idx ON public.attendance_locations USING btree (is_primary) WHERE ((is_primary = true) AND (is_active = true));


--
-- TOC entry 5091 (class 1259 OID 23779)
-- Name: attendance_sessions_employee_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX attendance_sessions_employee_date_idx ON public.attendance_sessions USING btree (employee_user_id, attendance_date DESC);


--
-- TOC entry 5092 (class 1259 OID 23778)
-- Name: attendance_sessions_one_open_per_employee_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX attendance_sessions_one_open_per_employee_idx ON public.attendance_sessions USING btree (employee_user_id) WHERE (punch_out_at IS NULL);


--
-- TOC entry 5095 (class 1259 OID 23780)
-- Name: attendance_sessions_open_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX attendance_sessions_open_idx ON public.attendance_sessions USING btree (punch_out_at) WHERE (punch_out_at IS NULL);


--
-- TOC entry 5079 (class 1259 OID 23696)
-- Name: employee_profiles_attendance_location_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX employee_profiles_attendance_location_id_idx ON public.employee_profiles USING btree (attendance_location_id);


--
-- TOC entry 5082 (class 1259 OID 23697)
-- Name: employee_profiles_employment_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX employee_profiles_employment_status_idx ON public.employee_profiles USING btree (employment_status);


--
-- TOC entry 5068 (class 1259 OID 23616)
-- Name: refresh_sessions_active_expiry_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX refresh_sessions_active_expiry_idx ON public.refresh_sessions USING btree (expires_at) WHERE (revoked_at IS NULL);


--
-- TOC entry 5073 (class 1259 OID 23615)
-- Name: refresh_sessions_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX refresh_sessions_user_id_idx ON public.refresh_sessions USING btree (user_id);


--
-- TOC entry 5107 (class 2620 OID 23710)
-- Name: employee_profiles employee_profiles_sync_employee_id; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER employee_profiles_sync_employee_id AFTER INSERT OR UPDATE OF employee_id ON public.employee_profiles FOR EACH ROW EXECUTE FUNCTION public.sync_employee_profile_id_to_username();


--
-- TOC entry 5106 (class 2620 OID 23711)
-- Name: users users_sync_employee_username; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER users_sync_employee_username AFTER UPDATE OF username ON public.users FOR EACH ROW WHEN (((new.role = 'EMPLOYEE'::public.user_role) AND (old.username IS DISTINCT FROM new.username))) EXECUTE FUNCTION public.sync_employee_username_to_profile_id();


--
-- TOC entry 5099 (class 2606 OID 23653)
-- Name: attendance_locations attendance_locations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_locations
    ADD CONSTRAINT attendance_locations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- TOC entry 5104 (class 2606 OID 23773)
-- Name: attendance_sessions attendance_sessions_attendance_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_sessions
    ADD CONSTRAINT attendance_sessions_attendance_location_id_fkey FOREIGN KEY (attendance_location_id) REFERENCES public.attendance_locations(id) ON DELETE RESTRICT;


--
-- TOC entry 5105 (class 2606 OID 23768)
-- Name: attendance_sessions attendance_sessions_employee_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_sessions
    ADD CONSTRAINT attendance_sessions_employee_user_id_fkey FOREIGN KEY (employee_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5100 (class 2606 OID 23686)
-- Name: employee_profiles employee_profiles_attendance_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_profiles
    ADD CONSTRAINT employee_profiles_attendance_location_id_fkey FOREIGN KEY (attendance_location_id) REFERENCES public.attendance_locations(id) ON DELETE SET NULL;


--
-- TOC entry 5101 (class 2606 OID 23691)
-- Name: employee_profiles employee_profiles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_profiles
    ADD CONSTRAINT employee_profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- TOC entry 5102 (class 2606 OID 23739)
-- Name: employee_profiles employee_profiles_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_profiles
    ADD CONSTRAINT employee_profiles_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.work_shifts(id) ON DELETE RESTRICT;


--
-- TOC entry 5103 (class 2606 OID 23681)
-- Name: employee_profiles employee_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_profiles
    ADD CONSTRAINT employee_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5098 (class 2606 OID 23610)
-- Name: refresh_sessions refresh_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_sessions
    ADD CONSTRAINT refresh_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- Completed on 2026-10-23 14:26:23

--
-- PostgreSQL database dump complete
--

\unrestrict yh0S3CnrKarSkqvoxRwZDmGFdjsfUOAETfiSHbtd4gg5gH66Xx1fwls9JQJjOeg

